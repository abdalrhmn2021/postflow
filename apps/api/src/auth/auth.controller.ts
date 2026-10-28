import { Body, Controller, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { registerSchema, type RegisterInput } from "./auth.schemas.js";
import { AuthService } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // POST /api/auth/register -> 201 { agency, user }
  // 400 VALIDATION_ERROR, 409 EMAIL_TAKEN / SLUG_TAKEN
  @Post("register")
  register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterInput) {
    return this.auth.register(body);
  }
}
