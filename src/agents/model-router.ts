import { createLogger } from "../shared/logger.js";
import type { AuthProfile, LLMMessage, LLMResponse } from "../shared/types.js";

const log = createLogger("model-router");

export class ModelRouter {
  private profiles: AuthProfile[];
  private currentProfileIndex = 0;
  private failedProfiles = new Map<string, { until: number }>();
  private primaryModel: string;
  private fallbacks: string[];
  private currentModelIndex = 0;

  constructor(config: {
    primary: string;
    fallbacks: string[];
    profiles: AuthProfile[];
  }) {
    this.primaryModel = config.primary;
    this.fallbacks = config.fallbacks;
    this.profiles = config.profiles;
  }

  async call(
    messages: LLMMessage[],
    options?: { model?: string },
  ): Promise<LLMResponse> {
    const model = options?.model ?? this.getCurrentModel();
    const profile = this.selectHealthyProfile(model);

    if (!profile) {
      throw new Error("No healthy API profile available");
    }

    log.debug(
      { model, profile: profile.name },
      "Calling LLM",
    );

    return this.callProvider(profile, model, messages);
  }

  markCurrentKeyFailed(): void {
    const profile = this.profiles[this.currentProfileIndex];
    if (profile) {
      this.failedProfiles.set(profile.name, {
        until: Date.now() + 60_000,
      });
      log.warn({ profile: profile.name }, "Profile marked as failed (cooldown 60s)");
    }
    this.currentProfileIndex =
      (this.currentProfileIndex + 1) % this.profiles.length;
  }

  failover(): void {
    this.currentModelIndex++;
    const model = this.getCurrentModel();
    log.warn({ model }, "Failing over to next model");
  }

  private getCurrentModel(): string {
    if (this.currentModelIndex === 0) return this.primaryModel;
    const fallbackIdx = this.currentModelIndex - 1;
    if (fallbackIdx < this.fallbacks.length) {
      return this.fallbacks[fallbackIdx];
    }
    return this.primaryModel;
  }

  private selectHealthyProfile(
    _model: string,
  ): AuthProfile | null {
    const now = Date.now();

    for (let i = 0; i < this.profiles.length; i++) {
      const idx = (this.currentProfileIndex + i) % this.profiles.length;
      const profile = this.profiles[idx];
      const failed = this.failedProfiles.get(profile.name);

      if (!failed || failed.until < now) {
        this.failedProfiles.delete(profile.name);
        this.currentProfileIndex = idx;
        return profile;
      }
    }

    return null;
  }

  private async callProvider(
    _profile: AuthProfile,
    _model: string,
    _messages: LLMMessage[],
  ): Promise<LLMResponse> {
    // TODO: implement actual LLM API calls (Anthropic, OpenAI, Volcengine)
    throw new Error("LLM provider not yet implemented");
  }
}
