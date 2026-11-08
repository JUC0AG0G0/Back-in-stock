/**
 * Pure helpers of the updater: which image to pull, and how to re-create the
 * container from `docker inspect` so that it keeps its volumes, ports, networks and
 * variables, but takes everything else (version, command, healthcheck) from the new image.
 */

/** Subset of `GET /containers/{id}/json` that we use. */
export interface ContainerInspect {
  Id: string;
  Name: string;
  /** Id of the image the container runs (its tag may already point to a newer image). */
  Image?: string;
  Config: ContainerConfig;
  HostConfig: HostConfig;
  Mounts?: { Type: string; Name?: string; Destination: string; RW: boolean }[];
  NetworkSettings: {
    Networks?: Record<string, EndpointSettings>;
  };
  State?: { Running: boolean; Status: string; Health?: { Status: string } };
}

/** Settings shared by images and containers. */
export interface ImageConfig {
  Hostname?: string;
  Env?: string[] | null;
  Labels?: Record<string, string> | null;
  Cmd?: string[] | null;
  Entrypoint?: string[] | null;
  WorkingDir?: string;
  User?: string;
  Healthcheck?: unknown;
  StopSignal?: string;
  ExposedPorts?: Record<string, object> | null;
  Volumes?: Record<string, object> | null;
  [key: string]: unknown;
}

export interface ContainerConfig extends ImageConfig {
  Image: string;
}

export interface HostConfig {
  Binds?: string[] | null;
  Mounts?: { Target: string }[] | null;
  [key: string]: unknown;
}

export interface EndpointSettings {
  Aliases?: string[] | null;
  Links?: string[] | null;
  IPAMConfig?: unknown;
  DriverOpts?: Record<string, string> | null;
  MacAddress?: string;
  [key: string]: unknown;
}

/** Subset of `GET /images/{name}/json`. */
export interface ImageInspect {
  Id: string;
  Config: ImageConfig;
}

export interface ImageRef {
  /** e.g. ghcr.io/juc0ag0g0/back-in-stock */
  repository: string;
  tag: string;
}

export function parseImageRef(ref: string): ImageRef {
  const at = ref.indexOf('@');
  const withoutDigest = at === -1 ? ref : ref.slice(0, at);
  const slash = withoutDigest.lastIndexOf('/');
  const colon = withoutDigest.lastIndexOf(':');
  // A colon before the last slash belongs to a registry port (localhost:5000/app).
  if (colon > slash) {
    return { repository: withoutDigest.slice(0, colon), tag: withoutDigest.slice(colon + 1) };
  }
  return { repository: withoutDigest, tag: 'latest' };
}

export const formatImageRef = ({ repository, tag }: ImageRef): string => `${repository}:${tag}`;

export type TagPlan =
  /** The tag follows releases (latest, 1, 1.4): pull it again, the container keeps its tag. */
  | { kind: 'floating'; image: ImageRef }
  /** The tag is a precise version (1.4.2): switch to the new version's tag. */
  | { kind: 'pinned'; image: ImageRef; tag: string }
  | { kind: 'unsupported'; reason: string };

const VARIANT = /(-full)$/;

/**
 * Chooses the image to pull for `targetVersion`, keeping the variant (slim or -full).
 * - latest, latest-full, 1, 1.4, 1-full... follow releases.
 * - 1.4.2, 1.4.2-full are pinned: we move to <target>, <target>-full.
 * - edge and anything else are not release images: no one-click update.
 */
export function planImageTag(currentRef: string, targetVersion: string): TagPlan {
  const current = parseImageRef(currentRef);
  const variant = VARIANT.exec(current.tag)?.[1] ?? '';
  const base = variant ? current.tag.slice(0, -variant.length) : current.tag;

  if (base === 'latest' || /^\d+(\.\d+)?$/.test(base)) {
    return { kind: 'floating', image: current };
  }
  if (/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(base)) {
    const tag = `${targetVersion}${variant}`;
    return { kind: 'pinned', image: { repository: current.repository, tag }, tag };
  }
  return {
    kind: 'unsupported',
    reason: `The container runs the "${current.tag}" tag, which does not follow releases.`,
  };
}

/** Version baked into an image (BIS_VERSION, or the OCI label set by the release workflow). */
export function imageVersion(image: ImageInspect): string | null {
  const env = image.Config.Env?.find((e) => e.startsWith('BIS_VERSION='));
  if (env) return env.slice('BIS_VERSION='.length);
  return image.Config.Labels?.['org.opencontainers.image.version'] ?? null;
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Body of `POST /containers/create` for the new container.
 *
 * `docker inspect` merges the old image's settings into the container's. Copied as is,
 * they would override the new image (e.g. an old BIS_VERSION). So we drop every value
 * that is identical to the old image's, and keep what the user set (compose file, -e, -v...).
 */
export function buildCreateBody(
  container: ContainerInspect,
  oldImage: ImageInspect,
  newImageRef: string,
): Record<string, unknown> {
  const old = oldImage.Config;
  const config: ContainerConfig = { ...container.Config, Image: newImageRef };

  const oldEnv = new Set(old.Env ?? []);
  config.Env = (container.Config.Env ?? []).filter((e) => !oldEnv.has(e));

  const labels: Record<string, string> = {};
  for (const [key, value] of Object.entries(container.Config.Labels ?? {})) {
    if (old.Labels?.[key] !== value) labels[key] = value;
  }
  config.Labels = labels;

  for (const key of ['Cmd', 'Entrypoint', 'WorkingDir', 'User', 'Healthcheck', 'StopSignal']) {
    if (sameJson(config[key], old[key])) delete config[key];
  }
  for (const key of ['ExposedPorts', 'Volumes'] as const) {
    const kept = Object.fromEntries(
      Object.entries(container.Config[key] ?? {}).filter(([k]) => !(k in (old[key] ?? {}))),
    );
    if (Object.keys(kept).length) config[key] = kept;
    else delete config[key];
  }
  // Docker sets the hostname to the short container id: let it pick a new one.
  if (config.Hostname && container.Id.startsWith(config.Hostname)) delete config.Hostname;

  // Volumes declared by the image but not in the compose file (anonymous volumes) would be
  // replaced by new, empty ones. Re-attach them explicitly: no data is left behind.
  const hostConfig: HostConfig = { ...container.HostConfig };
  const covered = new Set([
    ...(hostConfig.Binds ?? []).map((b) => b.split(':')[1]),
    ...(hostConfig.Mounts ?? []).map((m) => m.Target),
  ]);
  const extraBinds = (container.Mounts ?? [])
    .filter((m) => m.Type === 'volume' && m.Name && !covered.has(m.Destination))
    .map((m) => `${m.Name}:${m.Destination}${m.RW ? '' : ':ro'}`);
  if (extraBinds.length) hostConfig.Binds = [...(hostConfig.Binds ?? []), ...extraBinds];

  const shortId = container.Id.slice(0, 12);
  const endpoints: Record<string, EndpointSettings> = {};
  for (const [name, net] of Object.entries(container.NetworkSettings.Networks ?? {})) {
    const endpoint: EndpointSettings = {
      // The old short id is an automatic alias: the new container gets its own.
      Aliases: (net.Aliases ?? []).filter((a) => a !== shortId),
    };
    if (net.Links) endpoint.Links = net.Links;
    if (net.IPAMConfig) endpoint.IPAMConfig = net.IPAMConfig;
    if (net.DriverOpts) endpoint.DriverOpts = net.DriverOpts;
    endpoints[name] = endpoint;
  }

  return { ...config, HostConfig: hostConfig, NetworkingConfig: { EndpointsConfig: endpoints } };
}

/** Rewrites (or adds) `KEY=value` in a .env file, keeping every other line as is. */
export function setEnvValue(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  if (pattern.test(content)) return content.replace(pattern, line);
  const separator = content === '' || content.endsWith('\n') ? '' : '\n';
  return `${content}${separator}${line}\n`;
}
