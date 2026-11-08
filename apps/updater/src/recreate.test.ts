import { describe, expect, it } from 'vitest';
import {
  buildCreateBody,
  type ContainerInspect,
  type ImageInspect,
  imageVersion,
  parseImageRef,
  planImageTag,
  setEnvValue,
} from './recreate.js';

const REPO = 'ghcr.io/juc0ag0g0/back-in-stock';

describe('parseImageRef', () => {
  it('splits repository and tag, registry ports included', () => {
    expect(parseImageRef(`${REPO}:1.2.3`)).toEqual({ repository: REPO, tag: '1.2.3' });
    expect(parseImageRef(REPO)).toEqual({ repository: REPO, tag: 'latest' });
    expect(parseImageRef('localhost:5000/app')).toEqual({
      repository: 'localhost:5000/app',
      tag: 'latest',
    });
    expect(parseImageRef(`${REPO}:1.2@sha256:abc`)).toEqual({ repository: REPO, tag: '1.2' });
  });
});

describe('planImageTag', () => {
  it('pulls floating tags again', () => {
    for (const tag of ['latest', 'latest-full', '1', '1.4', '1-full']) {
      expect(planImageTag(`${REPO}:${tag}`, '1.5.0')).toEqual({
        kind: 'floating',
        image: { repository: REPO, tag },
      });
    }
    expect(planImageTag(REPO, '1.5.0').kind).toBe('floating');
  });

  it('moves pinned tags to the new version, keeping the variant', () => {
    expect(planImageTag(`${REPO}:1.4.2`, '1.5.0')).toMatchObject({ kind: 'pinned', tag: '1.5.0' });
    expect(planImageTag(`${REPO}:1.4.2-full`, '1.5.0')).toMatchObject({
      kind: 'pinned',
      tag: '1.5.0-full',
      image: { repository: REPO, tag: '1.5.0-full' },
    });
  });

  it('refuses edge and custom tags', () => {
    expect(planImageTag(`${REPO}:edge`, '1.5.0').kind).toBe('unsupported');
    expect(planImageTag('back-in-stock:smoke', '1.5.0').kind).toBe('unsupported');
  });
});

describe('imageVersion', () => {
  it('reads BIS_VERSION, then the OCI label', () => {
    expect(imageVersion({ Id: 'x', Config: { Env: ['A=1', 'BIS_VERSION=1.5.0'] } })).toBe('1.5.0');
    expect(
      imageVersion({
        Id: 'x',
        Config: { Labels: { 'org.opencontainers.image.version': '1.4.0' } },
      }),
    ).toBe('1.4.0');
    expect(imageVersion({ Id: 'x', Config: {} })).toBeNull();
  });
});

describe('buildCreateBody', () => {
  const oldImage: ImageInspect = {
    Id: 'sha256:old',
    Config: {
      Env: ['PATH=/usr/bin', 'BIS_VERSION=1.4.0', 'PORT=8080'],
      Labels: { 'org.opencontainers.image.version': '1.4.0' },
      Cmd: ['node', 'apps/server/dist/main.js'],
      WorkingDir: '/app',
      User: 'node',
      Healthcheck: { Test: ['CMD', 'old'] },
      ExposedPorts: { '8080/tcp': {} },
      Volumes: { '/data': {} },
    },
  };
  const container: ContainerInspect = {
    Id: 'abcdef1234567890',
    Name: '/bis-back-in-stock-1',
    Config: {
      Image: `${REPO}:latest`,
      Hostname: 'abcdef123456',
      Env: ['PATH=/usr/bin', 'BIS_VERSION=1.4.0', 'PORT=8080', 'TZ=Europe/Paris'],
      Labels: {
        'org.opencontainers.image.version': '1.4.0',
        'com.docker.compose.project': 'bis',
        'com.docker.compose.service': 'back-in-stock',
      },
      Cmd: ['node', 'apps/server/dist/main.js'],
      WorkingDir: '/app',
      User: 'node',
      Healthcheck: { Test: ['CMD', 'old'] },
      ExposedPorts: { '8080/tcp': {}, '9000/tcp': {} },
      Volumes: { '/data': {} },
    },
    HostConfig: {
      Binds: ['/srv/bis/data:/data:rw'],
      PortBindings: { '8080/tcp': [{ HostPort: '8080' }] },
      RestartPolicy: { Name: 'unless-stopped' },
    },
    Mounts: [
      { Type: 'bind', Destination: '/data', RW: true },
      { Type: 'volume', Name: 'anon123', Destination: '/cache', RW: true },
    ],
    NetworkSettings: {
      Networks: { bis_default: { Aliases: ['back-in-stock', 'abcdef123456'], NetworkID: 'n1' } },
    },
  };

  const body = buildCreateBody(container, oldImage, `${REPO}:latest`) as Record<string, never>;

  it('keeps what the user configured', () => {
    expect(body['Env']).toEqual(['TZ=Europe/Paris']);
    expect(body['Labels']).toEqual({
      'com.docker.compose.project': 'bis',
      'com.docker.compose.service': 'back-in-stock',
    });
    expect(body['ExposedPorts']).toEqual({ '9000/tcp': {} });
    expect(body['HostConfig']).toMatchObject({
      PortBindings: { '8080/tcp': [{ HostPort: '8080' }] },
      RestartPolicy: { Name: 'unless-stopped' },
    });
  });

  it('lets the new image provide its version, command and healthcheck', () => {
    for (const key of ['Cmd', 'WorkingDir', 'User', 'Healthcheck', 'Volumes', 'Hostname']) {
      expect(body).not.toHaveProperty(key);
    }
    expect(body['Image']).toBe(`${REPO}:latest`);
  });

  it('keeps every volume, anonymous ones included', () => {
    expect((body['HostConfig'] as unknown as { Binds: string[] }).Binds).toEqual([
      '/srv/bis/data:/data:rw',
      'anon123:/cache',
    ]);
  });

  it('joins the same networks with the same aliases', () => {
    expect(body['NetworkingConfig']).toEqual({
      EndpointsConfig: { bis_default: { Aliases: ['back-in-stock'] } },
    });
  });
});

describe('setEnvValue', () => {
  it('replaces only the given key', () => {
    const env = 'BIS_PORT=8080\nBIS_IMAGE_TAG=1.4.2\n# comment\nBIS_TZ=Europe/Paris\n';
    expect(setEnvValue(env, 'BIS_IMAGE_TAG', '1.5.0')).toBe(
      'BIS_PORT=8080\nBIS_IMAGE_TAG=1.5.0\n# comment\nBIS_TZ=Europe/Paris\n',
    );
  });

  it('adds the key when missing', () => {
    expect(setEnvValue('BIS_PORT=8080', 'BIS_IMAGE_TAG', '1.5.0')).toBe(
      'BIS_PORT=8080\nBIS_IMAGE_TAG=1.5.0\n',
    );
  });
});
