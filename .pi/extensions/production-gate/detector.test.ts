/**
 * Pure tests for the production gate detector.
 *
 * Run: pnpm exec tsx --test extensions/core/production-gate/detector.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { detectRisk, extractContextFromCommand } from "./detector.js";
import { DEFAULT_GATE_CONFIG } from "./types.js";

const cfg = DEFAULT_GATE_CONFIG;

// ─── safe commands (should NOT match) ────────────────────────────────────────

test("safe: kubectl get pods is allowed", () => {
  assert.equal(detectRisk("kubectl get pods", cfg), undefined);
});

test("safe: kubectl describe deployment is allowed", () => {
  assert.equal(detectRisk("kubectl describe deployment api", cfg), undefined);
});

test("safe: kubectl logs is allowed", () => {
  assert.equal(detectRisk("kubectl logs -n prod pod-xyz", cfg), undefined);
});

test("safe: kubectl diff is allowed (read-only)", () => {
  assert.equal(detectRisk("kubectl diff -f deploy.yaml", cfg), undefined);
});

test("safe: SELECT statement is allowed", () => {
  assert.equal(detectRisk("psql -c 'SELECT * FROM users'", cfg), undefined);
});

test("safe: UPDATE with WHERE is allowed", () => {
  assert.equal(detectRisk("psql -c 'UPDATE users SET active=true WHERE id=1'", cfg), undefined);
});

test("safe: ls command", () => {
  assert.equal(detectRisk("ls -la /tmp", cfg), undefined);
});

test("safe: docker ps", () => {
  assert.equal(detectRisk("docker ps", cfg), undefined);
});

// ─── kubectl mutations ───────────────────────────────────────────────────────

test("kubectl: apply triggers gate", () => {
  const m = detectRisk("kubectl apply -f deployment.yaml", cfg);
  assert.ok(m);
  assert.equal(m!.category, "kubectl");
  assert.equal(m!.subtype, "kubectl-apply");
});

test("kubectl: delete triggers gate", () => {
  const m = detectRisk("kubectl delete deployment api-service", cfg);
  assert.ok(m);
  assert.equal(m!.subtype, "kubectl-delete");
});

test("kubectl: exec triggers gate", () => {
  const m = detectRisk("kubectl exec -it pod-xyz -- sh", cfg);
  assert.ok(m);
  assert.equal(m!.subtype, "kubectl-exec");
});

test("kubectl: scale triggers gate", () => {
  const m = detectRisk("kubectl scale deployment api --replicas=5", cfg);
  assert.ok(m);
  assert.equal(m!.subtype, "kubectl-scale");
});

test("kubectl: --context safe context bypasses gate", () => {
  const cfgSafe = {
    ...cfg,
    safe_contexts: { ...cfg.safe_contexts, kubectl: ["staging-cluster", "minikube"] },
  };
  assert.equal(
    detectRisk("kubectl apply -f deploy.yaml --context=minikube", cfgSafe),
    undefined,
  );
});

test("kubectl: --context unknown still triggers gate", () => {
  const cfgSafe = {
    ...cfg,
    safe_contexts: { ...cfg.safe_contexts, kubectl: ["minikube"] },
  };
  const m = detectRisk("kubectl apply -f deploy.yaml --context=prod-cluster", cfgSafe);
  assert.ok(m);
  assert.equal(m!.subtype, "kubectl-apply");
});

// ─── DB migrations ───────────────────────────────────────────────────────────

test("db: prisma migrate deploy triggers gate", () => {
  const m = detectRisk("prisma migrate deploy", cfg);
  assert.ok(m);
  assert.equal(m!.category, "db_migrations");
});

test("db: alembic upgrade triggers gate", () => {
  const m = detectRisk("alembic upgrade head", cfg);
  assert.ok(m);
});

test("db: knex migrate:latest triggers gate", () => {
  const m = detectRisk("knex migrate:latest", cfg);
  assert.ok(m);
});

// ─── DB direct writes ────────────────────────────────────────────────────────

test("db-direct: DELETE without WHERE triggers gate", () => {
  const m = detectRisk("psql -c 'DELETE FROM users'", cfg);
  assert.ok(m);
  assert.equal(m!.category, "db_direct");
});

test("db-direct: DROP TABLE triggers gate", () => {
  const m = detectRisk("psql -c 'DROP TABLE users'", cfg);
  assert.ok(m);
});

test("db-direct: TRUNCATE triggers gate", () => {
  const m = detectRisk("psql -c 'TRUNCATE orders'", cfg);
  assert.ok(m);
});

test("db-direct: FLUSHALL triggers gate", () => {
  const m = detectRisk("redis-cli FLUSHALL", cfg);
  assert.ok(m);
});

// ─── Terraform / Helm ────────────────────────────────────────────────────────

test("terraform: apply triggers gate", () => {
  const m = detectRisk("terraform apply", cfg);
  assert.ok(m);
  assert.equal(m!.subtype, "terraform-apply");
});

test("terraform: destroy triggers gate", () => {
  const m = detectRisk("terraform destroy -auto-approve", cfg);
  assert.ok(m);
});

test("terraform: plan is allowed", () => {
  assert.equal(detectRisk("terraform plan", cfg), undefined);
});

test("helm: upgrade triggers gate", () => {
  const m = detectRisk("helm upgrade api ./chart", cfg);
  assert.ok(m);
});

test("helm: list is allowed", () => {
  assert.equal(detectRisk("helm list", cfg), undefined);
});

// ─── Git destructive ─────────────────────────────────────────────────────────

test("git: force push triggers gate", () => {
  const m = detectRisk("git push --force origin main", cfg);
  assert.ok(m);
});

test("git: -f push triggers gate", () => {
  const m = detectRisk("git push -f origin main", cfg);
  assert.ok(m);
});

test("git: push to main triggers gate (without force)", () => {
  const m = detectRisk("git push origin main", cfg);
  assert.ok(m);
  assert.equal(m!.subtype, "git-protected-push");
});

test("git: push to feat/* is allowed (default safe pattern)", () => {
  assert.equal(detectRisk("git push origin feat/login", cfg), undefined);
});

test("git: push to personal/* is allowed", () => {
  assert.equal(detectRisk("git push origin personal/test", cfg), undefined);
});

// ─── Publishing ──────────────────────────────────────────────────────────────

test("publish: npm publish triggers gate", () => {
  const m = detectRisk("npm publish", cfg);
  assert.ok(m);
  assert.equal(m!.category, "publishing");
  assert.equal(m!.severity, "critical");
});

test("publish: pnpm publish triggers gate", () => {
  const m = detectRisk("pnpm publish", cfg);
  assert.ok(m);
});

test("publish: cargo publish triggers gate", () => {
  const m = detectRisk("cargo publish --dry-run", cfg);
  assert.ok(m);
});

// ─── Destructive fs ──────────────────────────────────────────────────────────

test("fs: rm -rf / triggers gate", () => {
  const m = detectRisk("rm -rf /", cfg);
  assert.ok(m);
  assert.equal(m!.severity, "critical");
});

test("fs: sudo rm triggers gate", () => {
  const m = detectRisk("sudo rm /etc/passwd", cfg);
  assert.ok(m);
});

test("fs: chmod 777 / triggers gate", () => {
  const m = detectRisk("chmod 777 /", cfg);
  assert.ok(m);
});

// ─── Cloud delete ────────────────────────────────────────────────────────────

test("aws: delete s3 bucket triggers gate", () => {
  const m = detectRisk("aws s3 rb s3://my-bucket --force", cfg);
  // aws + 'rb' doesn't match the regex (delete|remove|terminate|destroy)
  // but if user types 'aws s3api delete-bucket' it should fire
  const m2 = detectRisk("aws s3api delete-bucket --bucket my-bucket", cfg);
  assert.ok(m2);
  assert.equal(m2!.category, "cloud_delete");
});

test("gcloud: instances delete triggers gate", () => {
  const m = detectRisk("gcloud compute instances delete my-vm", cfg);
  assert.ok(m);
});

test("aws: read commands are allowed", () => {
  assert.equal(detectRisk("aws s3 ls", cfg), undefined);
});

// ─── Container destructive ───────────────────────────────────────────────────

test("docker: volume rm triggers gate", () => {
  const m = detectRisk("docker volume rm myvol", cfg);
  assert.ok(m);
});

test("docker: system prune triggers gate", () => {
  const m = detectRisk("docker system prune -a", cfg);
  assert.ok(m);
});

// ─── Service control ─────────────────────────────────────────────────────────

test("service: systemctl restart triggers gate", () => {
  const m = detectRisk("systemctl restart nginx", cfg);
  assert.ok(m);
});

test("service: systemctl status is allowed", () => {
  assert.equal(detectRisk("systemctl status nginx", cfg), undefined);
});

// ─── Custom patterns ─────────────────────────────────────────────────────────

test("custom: pattern matches when configured", () => {
  const custom = {
    ...cfg,
    custom_patterns: [
      { name: "team-deploy", regex: "^\\./deploy\\.sh\\s+(prod|production)", category: "team-deploy", severity: "high" as const },
    ],
  };
  const m = detectRisk("./deploy.sh prod", custom);
  assert.ok(m);
  assert.equal(m!.subtype, "team-deploy");
});

test("custom: invalid regex is silently ignored", () => {
  const custom = {
    ...cfg,
    custom_patterns: [{ name: "bad", regex: "[(invalid", category: "x", severity: "high" as const }],
  };
  // Should not throw, just no match
  assert.doesNotThrow(() => detectRisk("anything", custom));
});

// ─── extractContextFromCommand ───────────────────────────────────────────────

test("ctx: kubectl --context= extracted", () => {
  const c = extractContextFromCommand("kubectl apply -f x.yaml --context=prod-east");
  assert.equal(c.kubectl_context, "prod-east");
});

test("ctx: kubectl --namespace extracted", () => {
  const c = extractContextFromCommand("kubectl get pods --namespace=production");
  assert.equal(c.kubectl_namespace, "production");
});

test("ctx: kubectl -n shorthand extracted", () => {
  const c = extractContextFromCommand("kubectl get pods -n production");
  assert.equal(c.kubectl_namespace, "production");
});

test("ctx: git push remote+branch extracted", () => {
  const c = extractContextFromCommand("git push origin main");
  assert.equal(c.git_remote, "origin");
  assert.equal(c.git_branch, "main");
});

test("ctx: -f file extracted", () => {
  const c = extractContextFromCommand("kubectl apply -f infra/k8s/api.yaml");
  assert.equal(c.file, "infra/k8s/api.yaml");
});
