# NOTICE

This project (`dsh-agy-link-quota`) is a fork of [`amlyczz/dsh-agy-link`](https://github.com/amlyczz/dsh-agy-link) by amlyczz, licensed under the MIT License.

## Modifications in this fork:
1. **Effective Quota Resolution (Antigravity-Manager Parity)**: Implemented bottleneck window resolution (`resolveEffectiveQuota`) based on Antigravity-Manager's `chosen_bucket` principle.
2. **Hard-lock & Exhaustion State**: Clearly labels and flags accounts and model families as locked (`🔒`) when weekly quota is exhausted, preventing misleading 100% 5h visual indicators.
3. **Shared Pool Transparency**: Explicitly visualizes shared weekly pools across model families (such as Claude & GPT-OSS sharing `3p-weekly`).
4. **Subscription Tier Probe**: Automatically probes and detects user account subscription tiers (`PRO` / `ULTRA` / `FREE`) via `v1internal:loadCodeAssist`.
5. **Endpoint Health Tracking**: Added `EndpointHealthTracker` with health degradation and observation windows.
