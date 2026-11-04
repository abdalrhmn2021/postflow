import { createHash, randomBytes } from "node:crypto";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Approval, PostStatus, type Prisma } from "../generated/prisma/client.js";
import type { SessionUser } from "../auth/auth.service.js";
import { BrandsService } from "../brands/brands.service.js";
import type { Env } from "../config/env.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AnswerInput } from "./review.schemas.js";

export const REVIEW_DAYS = 14;

// The posts a client can still see and answer on the link: not published, not being published.
const OPEN_STATUSES: PostStatus[] = [PostStatus.DRAFT, PostStatus.SCHEDULED, PostStatus.FAILED];

// Same idea as invite links: 32 random bytes in the link, only their SHA-256 in the database.
const newToken = () => randomBytes(32).toString("base64url");
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

// A wrong or expired link: one answer, the page says "this link doesn't work".
const linkInvalid = () =>
  new NotFoundException({ code: "REVIEW_LINK_INVALID", message: "This review link is wrong or expired" });
const postNotFound = () => new NotFoundException({ code: "POST_NOT_FOUND", message: "Post not found" });
const alreadyAnswered = () =>
  new ConflictException({ code: "REVIEW_DONE", message: "This post isn't waiting for an answer any more" });

// What the client sees of a post: what will go out, and where things stand. Nothing internal
// (who wrote it, failure reasons, other clients).
const reviewPostSelect = {
  id: true,
  caption: true,
  platforms: true,
  scheduledAt: true,
  status: true,
  approval: true,
  approvalNote: true,
  approvalAt: true,
  media: {
    select: { id: true, type: true, url: true, format: true, width: true, height: true, duration: true },
    orderBy: { position: "asc" },
  },
} satisfies Prisma.PostSelect;

// The client's side of approvals: a link per brand, made by the owner or a manager and sent to the
// client (WhatsApp ...). Whoever opens it - no account - sees the brand's posts that were sent for
// approval and answers each: approve, or ask for changes with a note. The link can do nothing else.
@Injectable()
export class ReviewService {
  private readonly site: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly brands: BrandsService,
    config: ConfigService<Env, true>,
  ) {
    this.site = config.get("WEB_ORIGIN", { infer: true }).split(",")[0].trim().replace(/\/+$/, "");
  }

  // A new link for the brand. Shown in this answer only (the database keeps the hash).
  // Older links keep working until they expire: a client may still have last week's.
  async createLink(user: SessionUser, brandId: string, lang: string) {
    const brand = await this.brands.get(user, brandId);
    const token = newToken();
    const expiresAt = new Date(Date.now() + REVIEW_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.reviewLink.create({ data: { brandId: brand.id, tokenHash: hash(token), expiresAt } });
    return { link: `${this.site}/${lang === "en" ? "en" : "ar"}/review/${token}`, expiresAt };
  }

  // Stops every link of the brand (a link sent to the wrong person, a client who left).
  async revokeLinks(user: SessionUser, brandId: string) {
    await this.brands.get(user, brandId);
    await this.prisma.reviewLink.deleteMany({ where: { brandId } });
  }

  // GET /review/:token - the brand, and its posts the client is asked about (waiting first),
  // not yet published. Answered ones stay visible so the client sees what they said.
  async open(token: string) {
    const link = await this.findLink(token);
    const posts = await this.prisma.post.findMany({
      where: {
        brandId: link.brandId,
        approval: { not: Approval.NONE },
        status: { in: OPEN_STATUSES },
      },
      select: reviewPostSelect,
      orderBy: [{ scheduledAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 100,
    });
    const order = { PENDING: 0, CHANGES_REQUESTED: 1, APPROVED: 2, NONE: 3 };
    return {
      brand: link.brand,
      expiresAt: link.expiresAt,
      posts: posts.sort((a, b) => order[a.approval] - order[b.approval]), // stable: by time within each
    };
  }

  // The client's answer about one post of that brand. Only a post waiting for it (PENDING) and not
  // published or being published: an answer can't undo the agency's later change, can't rewrite the
  // history of a post that's already out, and the same click twice changes nothing.
  async answer(token: string, postId: string, { decision, note }: AnswerInput) {
    const link = await this.findLink(token);
    const approved = decision === "APPROVE";
    const { count } = await this.prisma.post.updateMany({
      where: { id: postId, brandId: link.brandId, approval: Approval.PENDING, status: { in: OPEN_STATUSES } },
      data: {
        approval: approved ? Approval.APPROVED : Approval.CHANGES_REQUESTED,
        approvalNote: approved ? (note ?? null) : note,
        approvalAt: new Date(),
      },
    });
    if (count === 0) {
      const exists = await this.prisma.post.count({ where: { id: postId, brandId: link.brandId } });
      throw exists ? alreadyAnswered() : postNotFound();
    }
    return this.prisma.post.findUniqueOrThrow({ where: { id: postId }, select: reviewPostSelect });
  }

  private async findLink(token: string) {
    const link = await this.prisma.reviewLink.findUnique({
      where: { tokenHash: hash(token) },
      select: {
        brandId: true,
        expiresAt: true,
        brand: { select: { name: true, language: true, timezone: true, agency: { select: { name: true } } } },
      },
    });
    if (!link || link.expiresAt <= new Date()) throw linkInvalid();
    return link;
  }
}
