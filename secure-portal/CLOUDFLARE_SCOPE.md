# Cloudflare deployment scope

The staging deployment is deliberately restricted to these new resources:

- Worker: `bitwise-secure-portal-staging`
- Container: Wrangler-generated container for the `PortalContainer` class in that Worker
- Durable Objects: `PortalContainer` and `AuthRateLimiter` namespaces belonging to that Worker
- D1 database: `bitwise-secure-portal-staging-db` (`2751c532-68f9-4ffc-988e-bb7e3afaf935`)
- R2 bucket: `bitwise-secure-portal-staging-files`
- Custom hostname: `portal-test.bitwise-security.nl`

The provisioning script does not list, update, route, deploy, or delete any other
Worker, Pages project, bucket, database, container, hostname, or zone. It performs an
exact-name lookup of the staging bucket before creating it and uses only
`apps/edge/wrangler.staging.jsonc`.

Deployment credentials remain on the administrator workstation. GitHub Actions is
limited to credential-free validation and cannot deploy or read runtime secrets.

The following existing resources are explicitly out of scope:

- The `bitwise-security` marketing Pages project
- Its production deployment and Git integration
- Every unrelated Worker, Pages project, R2 bucket, DNS record, and Cloudflare zone
- `portal.bitwise-security.nl` until staging has passed the complete security checklist

There is intentionally no production Wrangler configuration or production provisioning
script yet. Production configuration will be created only after staging approval.
