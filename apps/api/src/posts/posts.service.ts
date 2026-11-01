import { randomUUID } from "node:crypto";
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
import { brandMediaPrefix, MediaStorage } from "../media/media-storage.js";
import { fileProblem, MEDIA_MAX } from "../media/media.rules.js";
import { connectedPlatforms } from "../meta/account.js";
import { MetaGraph } from "../meta/meta-graph.js";
import { problemsBeforeScheduling } from "./posts.rules.js";
import type {
  AttachMediaInput,
  CreatePostInput,
  ListPostsQuery,
  OrderMediaInput,
  UnscheduledPostsQuery,
  UpdatePostInput,
} from "./posts.schemas.js";

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
// A file that isn't this post's, or that was never uploaded. Same answer for both.
const mediaNotFound = () => new NotFoundException({ code: "MEDIA_NOT_FOUND", message: "File not found" });
const tooManyMedia = () =>
  new BadRequestException({ code: "MEDIA_LIMIT", message: `A post has at most ${MEDIA_MAX} files` });
const badFile = (problem: string) =>
  new BadRequestException({
    code: "VALIDATION_ERROR",
    message: "This file can't be used",
    fields: { file: problem },
  });
const mediaInUse = () =>
  new ConflictException({ code: "MEDIA_IN_USE", message: "This file is already on another post" });
const wrongOrder = () =>
  new BadRequestException({
    code: "VALIDATION_ERROR",
    message: "Some fields are missing or invalid",
    fields: { ids: "List every file of the post once" },
  });

const postSelect = {
  id: true,
  caption: true,
  platforms: true,
  status: true,
  scheduledAt: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  // timezone: the calendar shows times in it. account: which platforms it can be published to.
  brand: {
    select: {
      id: true,
      name: true,
      timezone: true,
      account: { select: { status: true, instagramId: true } },
    },
  },
  createdBy: { select: { id: true, name: true } }, // null once that staff member is removed
  media: {
    select: {
      id: true,
      type: true,
      url: true,
      format: true,
      width: true,
      height: true,
      duration: true,
      publicId: true,
    },
    orderBy: { position: "asc" },
  },
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

type Schedulable = Parameters<typeof problemsBeforeScheduling>[0];

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brands: BrandsService,
    private readonly storage: MediaStorage,
    private readonly meta: MetaGraph,
  ) {}

  // What still stops this post (as it will be after a change) from being scheduled. {} = ready.
  // Checks the brand's connected accounts too, once Meta is set up on this server.
  private problems(post: PostRow, after: Partial<Schedulable> = {}) {
    const connected = connectedPlatforms(post.brand.account, this.meta.configured);
    return problemsBeforeScheduling({ ...post, connected, ...after });
  }

  // The status a post has after a change (to its text, time, platforms or files):
  //   scheduled -> stays scheduled, so it must still be ready afterwards (else 400 POST_NOT_READY)
  //   failed    -> a draft again: someone is fixing it; then it's scheduled again
  //   draft     -> a draft
  private statusAfterChange(post: PostRow, after: Partial<Schedulable>) {
    if (post.status === PostStatus.SCHEDULED) {
      const problems = this.problems(post, after);
      if (Object.keys(problems).length > 0) throw notReady(problems);
    }
    return post.status === PostStatus.FAILED ? PostStatus.DRAFT : post.status;
  }

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
    const status = this.statusAfterChange(post, input);
    return this.write(post, { ...input, status });
  }

  // DRAFT or FAILED -> SCHEDULED (owner and managers; the controller checks the role).
  async schedule(user: SessionUser, id: string) {
    const post = await this.get(user, id);
    if (post.status === PostStatus.PUBLISHED) throw published();
    if (post.status === PostStatus.SCHEDULED) return post; // already done: asking twice is fine

    const problems = this.problems(post);
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
    await this.storage.remove(post.media); // the rows went with the post (cascade); now the files
  }

  // ---- Files (images and videos) --------------------------------------------------------------
  // Uploading is two calls, so a big video never passes through this server:
  //   1. POST /posts/:id/media/upload -> a signed ticket for ONE new file name of this brand
  //   2. the browser sends the file straight to Cloudinary with that ticket
  //   3. POST /posts/:id/media { publicId, type } -> the API asks Cloudinary what was uploaded,
  //      checks it, and adds it to the post
  // Files follow the post's rules: an editor only on a draft, nobody on a published post.

  async uploadTicket(user: SessionUser, id: string) {
    const post = await this.get(user, id);
    assertCanChange(user, post);
    if (post.media.length >= MEDIA_MAX) throw tooManyMedia();
    const publicId = brandMediaPrefix(user.agencyId, post.brand.id) + randomUUID();
    return { publicId, ...this.storage.uploadTicket(publicId) };
  }

  async attachMedia(user: SessionUser, id: string, { publicId, type }: AttachMediaInput) {
    const post = await this.get(user, id);
    assertCanChange(user, post);
    if (post.media.some((m) => m.publicId === publicId)) return post; // sent twice: already done

    // A name outside this brand's folder was never signed for this post (another brand's file,
    // another agency's, or made up) - and it's not ours to say which.
    if (!publicId.startsWith(brandMediaPrefix(user.agencyId, post.brand.id))) throw mediaNotFound();
    if (post.media.length >= MEDIA_MAX) throw tooManyMedia();

    const file = await this.storage.find(publicId, type);
    if (!file) throw mediaNotFound();
    const problem = fileProblem(file);
    if (problem) {
      await this.storage.remove([file]); // Cloudinary took it, we don't: don't keep paying for it
      throw badFile(problem);
    }

    const status = this.statusAfterChange(post, { media: [...post.media, file] });
    const { publicId: name, url, format, width, height, bytes, duration } = file;
    try {
      return await this.write(post, {
        status,
        media: {
          create: { type, publicId: name, url, format, width, height, bytes, duration, position: post.media.length },
        },
      });
    } catch (err) {
      if (isPrismaError(err, "P2002")) throw mediaInUse(); // one upload, attached to two posts of the brand
      throw err;
    }
  }

  // ids: every file of the post, in the new order.
  async orderMedia(user: SessionUser, id: string, { ids }: OrderMediaInput) {
    const post = await this.get(user, id);
    assertCanChange(user, post);
    const byId = new Map(post.media.map((m) => [m.id, m]));
    if (ids.length !== byId.size || !ids.every((mid) => byId.has(mid))) throw wrongOrder();

    const media = ids.map((mid) => byId.get(mid)!);
    const status = this.statusAfterChange(post, { media });
    return this.write(post, {
      status,
      media: { update: ids.map((mid, position) => ({ where: { id: mid }, data: { position } })) },
    });
  }

  async removeMedia(user: SessionUser, id: string, mediaId: string) {
    const post = await this.get(user, id);
    assertCanChange(user, post);
    const file = post.media.find((m) => m.id === mediaId);
    if (!file) throw mediaNotFound();

    const rest = post.media.filter((m) => m.id !== mediaId);
    // A scheduled Instagram post can't lose its last image - unschedule it first.
    const status = this.statusAfterChange(post, { media: rest });
    const updated = await this.write(post, {
      status,
      media: {
        delete: { id: mediaId },
        update: rest.map((m, position) => ({ where: { id: m.id }, data: { position } })), // no gaps: 0, 1, 2
      },
    });
    await this.storage.remove([file]);
    return updated;
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
