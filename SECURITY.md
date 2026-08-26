# Publication privacy and security

## Publication boundary

Only the output of `python3 scripts/build_publication.py` is a deployable base-site
artefact. Repository documentation, scripts, CI configuration, source material,
lock files, local paths, deployment targets, rollback copies, and generated
manifests do not belong in the web root.

The release gate checks the finished artefact and can crawl the deployed site. It
fails on source maps and source-map directives; framework/generator metadata;
revealing HTML comments; private addresses, hostnames, and filesystem paths;
secret-shaped values; debug/environment markers; labelled Git revisions;
source-only and rollback files; revealing PDF/image/video metadata; versioned
server banners; missing baseline browser-security headers; and non-uniform error
responses.

## Deliberately retained information

- Public prose, project descriptions, outbound links, and visible contact details
  remain editorial content. They are not rewritten to influence AI-authorship
  classifiers.
- The professional-profile PDF retains only its public title, author, and subject.
- Content-hashed asset names, standard HTTP cache validators, file formats, codec
  structures, and required client-side library code remain because they support
  caching, compatibility, and functionality. They are not treated as authorship
  claims.
- Cartoon Collingham visibly identifies its open-source speech option. That
  reviewed product attribution is recorded as a narrow path-and-rule allowance;
  other model/provider disclosures still fail the gate.

## Release expectations

Build and scan locally, keep environment-specific values outside Git, back up
replaced files outside the document root, validate server configuration before a
reload, and perform the live crawl after deployment. A Git push is not evidence
that the Apache-hosted site has changed; Git and live publication are verified
separately.
