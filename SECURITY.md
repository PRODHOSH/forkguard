<p align="center">
  <a href="https://github.com/PRODHOSH/forkguard">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="site/assets/brand/logo-on-dark.svg">
      <img src="site/assets/brand/logo.svg" alt="forkguard" height="56">
    </picture>
  </a>
</p>

# Security

## Reporting a problem in forkguard

If you find a security problem in forkguard itself, please email **hello@prodhosh.me** instead of opening a public issue. I will reply within a few days and credit you in the release notes if you like.

## Reporting malware that forkguard missed

That is not a secret, and other people benefit from knowing. Open a [Missed something](https://github.com/PRODHOSH/forkguard/issues/new?template=missed-malware.yml) issue and describe the shape of it, without pasting the malicious code.

## Supported versions

Only the latest release gets fixes. Update with:

```bash
npm install -g forkguard@latest
```

What forkguard does, what it never does and what it cannot do: [Safety and privacy](https://forkguard.pages.dev/internals/safety/).
