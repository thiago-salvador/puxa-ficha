import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const snapshot = JSON.parse(
  readFileSync("data/candidate-roster-active-20260829.json", "utf8"),
) as {
  metadata: {
    active_registration_count: number;
    active_profile_count: number;
    unresolved_count: number;
  };
  profiles: Array<{
    profile_slug: string;
    canonical_registration_sq: string | null;
    registration_sqs: string[];
    publication_status: "active" | "quarantine_duplicate_active";
  }>;
};

test("crosswalk canônico fecha o universo ativo e explicita duplicidades", () => {
  assert.equal(snapshot.metadata.active_registration_count, 209);
  assert.equal(snapshot.metadata.active_profile_count, 208);
  assert.equal(snapshot.metadata.unresolved_count, 0);
  assert.equal(snapshot.profiles.length, 208);
  assert.equal(
    new Set(snapshot.profiles.map((row) => row.profile_slug)).size,
    208,
  );

  const quarantine = snapshot.profiles.filter(
    (row) => row.publication_status === "quarantine_duplicate_active",
  );
  assert.deepEqual(
    quarantine.map((row) => ({
      profile_slug: row.profile_slug,
      canonical_registration_sq: row.canonical_registration_sq,
      registration_sqs: row.registration_sqs,
      publication_status: row.publication_status,
    })),
    [
      {
        profile_slug: "laudicerio-aguiar",
        canonical_registration_sq: null,
        registration_sqs: ["110002553937", "110002554073"],
        publication_status: "quarantine_duplicate_active",
      },
    ],
  );
  assert.ok(
    snapshot.profiles
      .filter((row) => row.publication_status === "active")
      .every(
        (row) => row.canonical_registration_sq === row.registration_sqs[0],
      ),
  );
});
