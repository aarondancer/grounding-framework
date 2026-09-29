# Runtime Configuration

Deployment-specific secrets/settings are not authored in `grounding/`.

Minimum runtime configuration:

```text
DATABASE_URL
VALKEY_MODE=standalone|cluster
VALKEY_ADDRESSES=host:port[,host:port...]
VALKEY_TLS=true|false
VALKEY_USERNAME=<secret/optional>
VALKEY_PASSWORD=<secret/optional>
GROUNDING_ENV=local|dev|staging|production
```

For local OrbStack development:

```text
DATABASE_URL=postgresql://grounding:grounding@localhost:5432/grounding
VALKEY_MODE=standalone
VALKEY_ADDRESSES=localhost:6379
VALKEY_TLS=false
GROUNDING_ENV=local
```

Production credentials MUST come from the host's secret-management mechanism, not Git-authored grounding files.

Other deployment-specific settings may include GraphQL cost/depth ceilings, connection pool sizes, cache TTL ceilings, embedding provider endpoint/model/credentials, GitHub source-link metadata, log level, and OpenTelemetry exporter configuration.

The cache package interprets Valkey deployment mode and constructs the correct locked GLIDE client. Domain packages do not parse Valkey environment variables directly.
