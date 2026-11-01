import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { Role } from "../generated/prisma/client.js";
import type { SessionUser } from "../auth/auth.service.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import {
  attachMediaSchema,
  createPostSchema,
  listPostsSchema,
  orderMediaSchema,
  unscheduledPostsSchema,
  updatePostSchema,
  type AttachMediaInput,
  type CreatePostInput,
  type ListPostsQuery,
  type OrderMediaInput,
  type UnscheduledPostsQuery,
  type UpdatePostInput,
} from "./posts.schemas.js";
import { PostsService } from "./posts.service.js";

// Posts. Anyone logged in may draft for the brands they see; scheduling is for the owner and managers.
// A post outside the user's reach is always 404 POST_NOT_FOUND.
@Controller("posts")
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  // GET /api/posts?from=2026-11-01T00:00:00+02:00&to=2026-12-01T00:00:00+02:00[&brandId=]
  //   -> the calendar's posts, earliest first | 400 VALIDATION_ERROR (bad dates, more than 62 days)
  @Get()
  list(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(listPostsSchema)) query: ListPostsQuery) {
    return this.posts.list(user, query);
  }

  // GET /api/posts/unscheduled[?brandId=] -> drafts with no time yet. Before :id, or "unscheduled" is an id.
  @Get("unscheduled")
  unscheduled(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(unscheduledPostsSchema)) query: UnscheduledPostsQuery,
  ) {
    return this.posts.unscheduled(user, query);
  }

  // GET /api/posts/:id
  @Get(":id")
  get(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.posts.get(user, id);
  }

  // POST /api/posts { brandId, caption?, platforms?, scheduledAt? } -> 201, a draft | 404 BRAND_NOT_FOUND
  @Post()
  create(@CurrentUser() user: SessionUser, @Body(new ZodValidationPipe(createPostSchema)) body: CreatePostInput) {
    return this.posts.create(user, body);
  }

  // PATCH /api/posts/:id -> only the fields sent change
  //   | 403 (an editor, on a post past draft) | 409 POST_PUBLISHED / POST_CHANGED | 400 POST_NOT_READY
  @Patch(":id")
  update(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePostSchema)) body: UpdatePostInput,
  ) {
    return this.posts.update(user, id, body);
  }

  // POST /api/posts/:id/schedule -> the scheduled post | 400 POST_NOT_READY { fields } | 409 POST_PUBLISHED
  @Post(":id/schedule")
  @Roles(Role.OWNER, Role.MANAGER)
  @HttpCode(200)
  schedule(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.posts.schedule(user, id);
  }

  // POST /api/posts/:id/unschedule -> back to a draft | 409 POST_PUBLISHED
  @Post(":id/unschedule")
  @Roles(Role.OWNER, Role.MANAGER)
  @HttpCode(200)
  unschedule(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.posts.unschedule(user, id);
  }

  // DELETE /api/posts/:id -> 204 | 403 (an editor, on a post past draft) | 409 POST_PUBLISHED
  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.posts.remove(user, id);
  }

  // POST /api/posts/:id/approval -> the post, waiting for the client (shown on the brand's review link)
  //   | 409 POST_SCHEDULED | 400 POST_NOT_READY (nothing written yet)
  @Post(":id/approval")
  @HttpCode(200)
  requestApproval(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.posts.requestApproval(user, id);
  }

  // Files. Same rule as changing the post: an editor only on a draft, nobody on a published post.
  // Each answers with the whole post, so the editor just shows what comes back.

  // POST /api/posts/:id/media/upload -> { publicId, url, fields } - POST the file to url with fields
  //   | 400 MEDIA_LIMIT (10 already) | 503 MEDIA_NOT_CONFIGURED (no CLOUDINARY_URL)
  @Post(":id/media/upload")
  @HttpCode(200)
  uploadTicket(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.posts.uploadTicket(user, id);
  }

  // POST /api/posts/:id/media { publicId, type: IMAGE | VIDEO } -> the post with the file at the end
  //   | 404 MEDIA_NOT_FOUND | 400 VALIDATION_ERROR { fields: { file } } | 400 POST_NOT_READY (a scheduled post)
  @Post(":id/media")
  @HttpCode(200)
  attachMedia(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(attachMediaSchema)) body: AttachMediaInput,
  ) {
    return this.posts.attachMedia(user, id, body);
  }

  // PUT /api/posts/:id/media/order { ids: [every file id, in the new order] } -> the post
  @Put(":id/media/order")
  orderMedia(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(orderMediaSchema)) body: OrderMediaInput,
  ) {
    return this.posts.orderMedia(user, id, body);
  }

  // DELETE /api/posts/:id/media/:mediaId -> the post without it (the file is deleted from Cloudinary too)
  @Delete(":id/media/:mediaId")
  removeMedia(@CurrentUser() user: SessionUser, @Param("id") id: string, @Param("mediaId") mediaId: string) {
    return this.posts.removeMedia(user, id, mediaId);
  }
}
