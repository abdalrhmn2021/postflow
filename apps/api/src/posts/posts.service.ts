import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PostStatus, Prisma, Role } from "../generated/prisma/client.js";
import type { SessionUser } from "../auth/auth.service.js";
import { BrandsService, visibleBrands } from "../brands/brands.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { problemsBeforeScheduling } from "./posts.rules.js";
import type { CreatePostInput, ListPostsQuery, UnscheduledPostsQuery, UpdatePostInput } from "./posts.schemas.js";

// 404 for a post of another agency or of a brand an editor isn't on - like brands, the answer
// doesn't tell that the post exists.
const notFound = () => new NotFoundException({ code: "POST_NOT_FOUND", message: "Post not found" });
const published = () =>
  new ConflictException({ code: "POST_PUBLISHED", message: "This post is already published and can't be changed" });
const editorsDraftOnly = () =>
  new ForbiddenException({ code: "FORBIDDEN", message: "Only a manager or the owner can change a scheduled post" });
// Someone else (or the worker) changed the post between our read and our write.
const changedMeanwhile = () =>
  new ConflictException({ code: "POST_CHANGED", message: "The post changed meanwhile - reload it and try again" });
const notReady = (fields: Record<string, string>) =>
  new BadRequestException({ code: "POST_NOT_READY", message: "The post isn't ready to be scheduled", fields });

const postSelect = {
  id: true,
  caption: true,
  platforms: true,
  status: true,
  scheduledAt: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  brand: { select: { id: true, name: true, timezone: true } }, // timezone: the calendar shows times in it
  createdBy: { select: { id: true, name: true } }, // null once that staff member is removed
} satisfies Prisma.PostSelect;

type PostRow = Prisma.PostGetPayload<{ select: typeof postSelect }>;

// The posts a user may see: the posts of the brands they may see. One rule for the whole app.
function visiblePosts(user: SessionUser): Prisma.PostWhereInput {
  return { brand: visibleBrands(user) };
}

function isPrismaError(err: unknown, code: string) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
}

// Who may change or delete a post in its current state:
//   published          -> nobody (it's history)
//   scheduled / failed -> the owner and managers
//   draft              -> anyone who can see it
function assertCanChange(user: SessionUser, post: PostRow) {
  if (post.status === PostStatus.PUBLISHED) throw published();
  if (user.role === Role.EDITOR && post.status !== PostStatus.DRAFT) throw editorsDraftOnly();
}

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brands: BrandsService,
  ) {}

  // The calendar: posts with a time in [from, to), earliest first.
  list(user: SessionUser, { from, to, brandId }: ListPostsQuery) {
    return this.prisma.post.findMany({
      // A brandId the user can't see simply matches nothing: an empty list, no hint it exists.
      where: { ...visiblePosts(user), scheduledAt: { gte: from, lt: to }, ...(brandId && { brandId }) },
      select: postSelect,
      orderBy: { scheduledAt: "asc" },
    });
  }

  // Drafts with no time yet - the calendar shows them in a side list. Most recently touched first.
  unscheduled(user: SessionUser, { brandId }: UnscheduledPostsQuery) {
    return this.prisma.post.findMany({
      where: { ...visiblePosts(user), scheduledAt: null, ...(brandId && { brandId }) },
      select: postSelect,
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
  }

  async get(user: SessionUser, id: string) {
    const post = await this.prisma.post.findFirst({ where: { id, ...visiblePosts(user) }, select: postSelect });
    if (!post) throw notFound();
    return post;
  }

  async create(user: SessionUser, { brandId, ...input }: CreatePostInput) {
    await this.brands.get(user, brandId); // 404 BRAND_NOT_FOUND if the user can't see this brand
    return this.prisma.post.create({
      data: { ...input, brandId, createdById: user.id }, // always a draft (the column's default)
      select: postSelect,
    });
  }

  async update(user: SessionUser, id: string, input: UpdatePostInput) {
    const post = await this.get(user, id);
    assertCanChange(user, post);

    let status = post.status;
    if (status === PostStatus.SCHEDULED) {
      // A scheduled post stays scheduled, so it must still be ready after the change.
      const problems = problemsBeforeScheduling({ ...post, ...input });
      if (Object.keys(problems).length > 0) throw notReady(problems);
    } else if (status === PostStatus.FAILED) {
      status = PostStatus.DRAFT; // fixing a failed post makes it a draft again; then schedule it again
    }
    return this.write(post, { ...input, status });
  }

  // DRAFT or FAILED -> SCHEDULED (owner and managers; the controller checks the role).
  async schedule(user: SessionUser, id: string) {
    const post = await this.get(user, id);
    if (post.status === PostStatus.PUBLISHED) throw published();
    if (post.status === PostStatus.SCHEDULED) return post; // already done: asking twice is fine

    const problems = problemsBeforeScheduling(post);
    if (Object.keys(problems).length > 0) throw notReady(problems);
    return this.write(post, { status: PostStatus.SCHEDULED });
  }

  // SCHEDULED or FAILED -> DRAFT: take it off the worker's list, keep everything else.
  async unschedule(user: SessionUser, id: string) {
    const post = await this.get(user, id);
    if (post.status === PostStatus.PUBLISHED) throw published();
    if (post.status === PostStatus.DRAFT) return post;
    return this.write(post, { status: PostStatus.DRAFT });
  }

  async remove(user: SessionUser, id: string) {
    const post = await this.get(user, id);
    assertCanChange(user, post);
    // Same guard as write(): don't delete a post the worker has just started publishing.
    const { count } = await this.prisma.post.deleteMany({ where: { id, status: post.status } });
    if (count === 0) throw changedMeanwhile();
  }

  // Writes only if the post is still exactly as we read it (same status, same updatedAt).
  // Without this, an editor saving a draft while a manager schedules it - or the worker publishing it -
  // could silently undo the other person's change.
  private async write(post: PostRow, data: Prisma.PostUpdateInput) {
    try {
      return await this.prisma.post.update({
        where: { id: post.id, status: post.status, updatedAt: post.updatedAt },
        data,
        select: postSelect,
      });
    } catch (err) {
      if (isPrismaError(err, "P2025")) throw changedMeanwhile();
      throw err;
    }
  }
}
