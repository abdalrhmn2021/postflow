import { Injectable, Logger } from "@nestjs/common";
import { AccountStatus, Platform, PostStatus, PublicationStatus } from "../generated/prisma/client.js";
import { MetaApiError } from "../meta/graph-api.meta.js";
import { MetaGraph, type Published, type PublishInput } from "../meta/meta-graph.js";
import { TokenCipher } from "../meta/token-cipher.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { publishUrl } from "./publish-url.js";

// Thrown to tell BullMQ "try this job again later" (Meta busy, a rate limit, no network).
export class RetryLater extends Error {}

export type PublishResult = "published" | "failed" | "skipped";

const PLATFORM_NAMES: Record<Platform, string> = { FACEBOOK: "Facebook", INSTAGRAM: "Instagram" };

// Publishes one post - one attempt. Called by the worker for each job; tests call it directly.
//
//   1. still the same post at the same time, scheduled? (it may have been unscheduled, moved, deleted)
//   2. claim it: SCHEDULED -> PUBLISHING. From here the website can't change it (409 POST_PUBLISHING).
//   3. each platform not already published: send it to Meta, write down what happened (a Publication)
//   4. all out -> PUBLISHED. Meta refused for good (bad file, no permission) -> FAILED with Meta's reason.
//      Meta busy -> RetryLater (the job runs again in 1, 2, 4 minutes); on the last try -> FAILED.
// A platform already published is never sent again: if Facebook went out and Instagram didn't,
// the retry - or publishing again after a fix - sends Instagram only.
@Injectable()
export class PublisherService {
  private readonly logger = new Logger(PublisherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly meta: MetaGraph,
    private readonly cipher: TokenCipher,
  ) {}

  async publish(postId: string, at: number, lastAttempt: boolean): Promise<PublishResult> {
    const scheduledAt = new Date(at);
    // Claim it. Only this one statement decides who publishes: two workers can't both get it.
    const { count } = await this.prisma.post.updateMany({
      where: { id: postId, scheduledAt, status: { in: [PostStatus.SCHEDULED, PostStatus.PUBLISHING] } },
      data: { status: PostStatus.PUBLISHING },
    });
    if (count === 0) return "skipped"; // unscheduled, moved to another time, published, or deleted

    const post = await this.prisma.post.findUniqueOrThrow({
      where: { id: postId },
      select: {
        caption: true,
        platforms: true,
        media: { select: { type: true, url: true, format: true }, orderBy: { position: "asc" } },
        publications: { select: { platform: true, status: true } },
        brand: { select: { account: true } },
      },
    });
    const account = post.brand.account;

    // Before calling Meta at all: things that won't get better by waiting.
    if (!this.meta.configured) return this.fail(postId, "Publishing isn't set up on the server (META_APP_ID)");
    if (!account || account.status !== AccountStatus.OK) {
      return this.fail(postId, "The client's Facebook page isn't connected");
    }
    let token: string;
    try {
      token = this.cipher.decrypt(account.pageToken);
    } catch {
      await this.needsReconnect(account.brandId); // TOKEN_ENCRYPTION_KEY changed
      return this.fail(postId, "The client's Facebook page isn't connected");
    }

    const input: PublishInput = { caption: post.caption, media: post.media.map(publishUrl) };
    const done = new Set(
      post.publications.filter((p) => p.status === PublicationStatus.PUBLISHED).map((p) => p.platform),
    );
    const errors: { platform: Platform; message: string; retryable: boolean }[] = [];

    // Facebook first, then Instagram - each on its own: one failing doesn't stop the other.
    for (const platform of [Platform.FACEBOOK, Platform.INSTAGRAM]) {
      if (!post.platforms.includes(platform) || done.has(platform)) continue;
      try {
        let result: Published;
        if (platform === Platform.FACEBOOK) {
          result = await this.meta.publishToFacebook(account.pageId, token, input);
        } else {
          if (!account.instagramId) throw new MetaApiError("The client's Instagram account isn't connected", 100);
          result = await this.meta.publishToInstagram(account.instagramId, token, input);
        }
        await this.record(postId, platform, {
          status: PublicationStatus.PUBLISHED,
          externalId: result.id,
          url: result.url,
        });
      } catch (err) {
        const meta = err instanceof MetaApiError ? err : null;
        const message = meta?.message ?? `Unexpected error: ${(err as Error).message}`;
        // Unknown errors (a bug, a crash) are tried again too: they may not happen twice.
        const retryable = meta ? meta.retryable : true;
        if (meta?.tokenRefused) await this.needsReconnect(account.brandId);
        this.logger.warn(`Post ${postId} on ${platform}: ${message}${retryable ? " (will retry)" : ""}`);
        await this.record(postId, platform, { status: PublicationStatus.FAILED, error: message });
        errors.push({ platform, message, retryable });
      }
    }

    if (errors.length === 0) {
      await this.prisma.post.updateMany({
        where: { id: postId, status: PostStatus.PUBLISHING },
        data: { status: PostStatus.PUBLISHED, publishedAt: new Date(), failReason: null },
      });
      return "published";
    }
    // Something may still work later, and there are tries left: keep it PUBLISHING, let BullMQ retry.
    if (!lastAttempt && errors.every((e) => e.retryable)) {
      throw new RetryLater(errors.map((e) => `${PLATFORM_NAMES[e.platform]}: ${e.message}`).join(" | "));
    }
    return this.fail(postId, errors.map((e) => `${PLATFORM_NAMES[e.platform]}: ${e.message}`).join("\n"));
  }

  private async fail(postId: string, reason: string): Promise<PublishResult> {
    await this.prisma.post.updateMany({
      where: { id: postId, status: PostStatus.PUBLISHING },
      data: { status: PostStatus.FAILED, failReason: reason },
    });
    return "failed";
  }

  private record(
    postId: string,
    platform: Platform,
    data: { status: PublicationStatus; externalId?: string; url?: string | null; error?: string },
  ) {
    const fields = { externalId: null, url: null, error: null, ...data };
    return this.prisma.publication.upsert({
      where: { postId_platform: { postId, platform } },
      create: { postId, platform, ...fields, attempts: 1 },
      update: { ...fields, attempts: { increment: 1 } },
    });
  }

  // Meta refused the page's token: the client's page shows "needs connecting again", and nothing
  // more is scheduled for it until the owner does.
  private needsReconnect(brandId: string) {
    return this.prisma.socialAccount.updateMany({
      where: { brandId },
      data: { status: AccountStatus.NEEDS_RECONNECT, checkedAt: new Date() },
    });
  }
}
