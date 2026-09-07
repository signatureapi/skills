# Writing style for the skills

These rules apply to every `SKILL.md`, every file under `references/`, and
the README. `test/style.test.mjs` and `test/timeless.test.mjs` check the
ones a script can check.

1. Short sentences. Aim under 20 words. Never over 30.
2. One instruction per sentence.
3. Common words. Say "use", "check", "ask". Do not say "leverage", "surface" (as a verb), "orchestrate", "utilize", "seamless", "robust", or "in order to".
4. Imperative mood. "Query the spec", not "the spec should be queried".
5. No metaphors, aphorisms, or rhetorical flourishes. State the fact.
6. Define each domain term once, in Vocabulary. Reuse the same word everywhere.
7. Prefer a list to a paragraph when the items are parallel.
8. Keep every fact and identifier as it is. A style edit changes wording, not meaning. If you cut a sentence, its instruction must survive somewhere.
9. Leave the scripts alone. These rules are for prose.
10. The user's words stay the user's. SignatureAPI terms name the API boundary only. Never tell an agent to rename a user's concept; tell it to map the concept.
11. Timeless and public. Skill content must read the same in a year. No internal ticket ids, no PR or branch state, no "verified on" dates, no session URLs, no local workspace paths, no qualifiers about what has or has not shipped. Provenance goes in commits, PRs and release notes. Example values in prose are clearly fictional; a captured sample payload in a code block may keep its real timestamp.
12. Questions to the user come in small groups. At most four per message, related ones together, one decision each, the proposed answer next to it. Brevity is measured in decisions asked, not only in words.
