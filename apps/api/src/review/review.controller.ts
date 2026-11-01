import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { Role } from "../generated/prisma/client.js";
import type { SessionUser } from "../auth/auth.service.js";
import { CurrentUser, Public, Roles } from "../auth/decorators.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { answerSchema, type AnswerInput } from "./review.schemas.js";
import { ReviewService } from "./review.service.js";

// Client approvals. The agency's side needs a login (owner or manager); the client's side is the
// link itself - @Public, the secret in the URL is the key, and it reaches one brand's posts only.
@Controller()
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  // POST /api/brands/:id/review-link?lang=ar -> { link, expiresAt } (the link is shown once)
  @Post("brands/:id/review-link")
  @Roles(Role.OWNER, Role.MANAGER)
  createLink(@CurrentUser() user: SessionUser, @Param("id") id: string, @Query("lang") lang?: string) {
    return this.review.createLink(user, id, lang ?? "ar");
  }

  // DELETE /api/brands/:id/review-link -> 204: every link of this client stops working
  @Delete("brands/:id/review-link")
  @Roles(Role.OWNER, Role.MANAGER)
  @HttpCode(204)
  revokeLinks(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.review.revokeLinks(user, id);
  }

  // GET /api/review/:token -> { brand, expiresAt, posts } | 404 REVIEW_LINK_INVALID
  @Public()
  @Get("review/:token")
  open(@Param("token") token: string) {
    return this.review.open(token);
  }

  // POST /api/review/:token/posts/:postId { decision: APPROVE | CHANGES, note? } -> the post
  //   | 409 REVIEW_DONE (not waiting any more) | 404
  @Public()
  @Post("review/:token/posts/:postId")
  @HttpCode(200)
  answer(
    @Param("token") token: string,
    @Param("postId") postId: string,
    @Body(new ZodValidationPipe(answerSchema)) body: AnswerInput,
  ) {
    return this.review.answer(token, postId, body);
  }
}
