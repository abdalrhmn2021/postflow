import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { Role } from "../generated/prisma/client.js";
import type { SessionUser } from "../auth/auth.service.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import {
  createPostSchema,
  listPostsSchema,
  unscheduledPostsSchema,
  updatePostSchema,
  type CreatePostInput,
  type ListPostsQuery,
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
}
