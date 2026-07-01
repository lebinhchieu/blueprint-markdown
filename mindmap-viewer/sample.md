:::mindmap

# Database latency > 2s
Dashboards spin on every load. p95 is 2.4s.

## Add Redis cache {#redis}
Cache hot queries; TTL 60s.
```js
client.setex(key, 60, val)
```

### Warm cache on deploy
- [ ] Prefetch top 100 queries
- [ ] Alert if hit-rate < 80%

## Add CDN
Offload static assets. Shares invalidation logic with [[redis]].

### Purge on publish {type=solution}
Invalidate edge cache whenever content changes.

# Onboarding drop-off
25% of signups abandon at step 3.

## Simplify step 3
Cut the form from 9 fields to 3.

:::
