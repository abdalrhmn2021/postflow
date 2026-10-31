import { Module } from "@nestjs/common";
import { BrandsModule } from "../brands/brands.module.js";
import { PostsController } from "./posts.controller.js";
import { PostsService } from "./posts.service.js";

@Module({
  imports: [BrandsModule], // a new post's brand must be one the user can see
  controllers: [PostsController],
  providers: [PostsService],
})
export class PostsModule {}
