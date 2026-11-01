import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Redirect } from "@nestjs/common";
import { Role } from "../generated/prisma/client.js";
import type { SessionUser } from "../auth/auth.service.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { callbackQuerySchema, connectPageSchema, type CallbackQuery, type ConnectPageInput } from "./meta.schemas.js";
import { MetaService } from "./meta.service.js";

// Connecting clients' Facebook pages (and the Instagram linked to them). Connecting and disconnecting
// are the owner's, as in the plan's roles table; a manager may check a connection.
// The two GET routes with @Redirect are opened by the browser itself (a link, then Facebook's
// redirect), not by api(): they answer with a redirect, never JSON.
@Controller()
export class MetaController {
  constructor(private readonly meta: MetaService) {}

  // GET /api/meta -> { configured } - the site shows "Connect" only when it can work
  @Get("meta")
  status() {
    return { configured: this.meta.configured };
  }

  // GET /api/brands/:id/meta/connect?lang=ar -> 302 to Facebook's login | 503 META_NOT_CONFIGURED
  @Get("brands/:id/meta/connect")
  @Roles(Role.OWNER)
  @Redirect()
  async connectStart(@CurrentUser() user: SessionUser, @Param("id") id: string, @Query("lang") lang?: string) {
    return { url: await this.meta.loginUrl(user, id, lang ?? "ar"), statusCode: 302 };
  }

  // GET /api/meta/callback?code=...&state=... (Facebook sends the browser here)
  //   -> 302 to the client's page: ?meta=<pick> to choose a page, or ?meta_error=denied|expired|no_pages|failed
  @Get("meta/callback")
  @Roles(Role.OWNER)
  @Redirect()
  async callback(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(callbackQuerySchema)) query: CallbackQuery,
  ) {
    return { url: await this.meta.callback(user, query), statusCode: 302 };
  }

  // GET /api/brands/:id/meta/pages/:pick -> the pages to choose from (no tokens) | 404 META_PICK_EXPIRED
  @Get("brands/:id/meta/pages/:pick")
  @Roles(Role.OWNER)
  pages(@CurrentUser() user: SessionUser, @Param("id") id: string, @Param("pick") pick: string) {
    return this.meta.pages(user, id, pick);
  }

  // PUT /api/brands/:id/meta { pick, pageId } -> the connected account | 409 PAGE_IN_USE
  @Put("brands/:id/meta")
  @Roles(Role.OWNER)
  connect(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(connectPageSchema)) body: ConnectPageInput,
  ) {
    return this.meta.connect(user, id, body);
  }

  // DELETE /api/brands/:id/meta -> 204 | 404 ACCOUNT_NOT_FOUND
  @Delete("brands/:id/meta")
  @Roles(Role.OWNER)
  @HttpCode(204)
  disconnect(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.meta.disconnect(user, id);
  }

  // POST /api/brands/:id/meta/check -> the account, status OK or NEEDS_RECONNECT | 502 META_ERROR
  @Post("brands/:id/meta/check")
  @Roles(Role.OWNER, Role.MANAGER)
  @HttpCode(200)
  check(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.meta.check(user, id);
  }
}
