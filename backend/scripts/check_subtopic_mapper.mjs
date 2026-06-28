import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mapOpenAlexSubtopics } from '../src/worker/discovery/subtopic.mapper.ts';

const fixtureDir = new URL('../src/worker/provider-clients/__fixtures__/', import.meta.url);

const readFixture = async file =>
  JSON.parse(await readFile(new URL(file, fixtureDir), 'utf8'));

const topicSearchResponse = await readFixture('openalex-topic-search-response.json');
const topicGroupByResponse = await readFixture('openalex-works-group-by-response.json');

const candidates = mapOpenAlexSubtopics({
  topicSearchResponse,
  topicGroupByResponse,
});

assert.ok(candidates.length >= 3);

for (const candidate of candidates) {
  assert.ok(candidate.name);
  assert.ok(candidate.normalizedName);
  assert.equal(candidate.provider, 'openalex');
  assert.ok(candidate.providerTopicId);
  assert.equal(typeof candidate.paperCount, 'number');
  assert.equal(typeof candidate.sourceCount, 'number');
  assert.equal(typeof candidate.confidence, 'number');
  assert.ok(candidate.evidence);
}

console.log(candidates);