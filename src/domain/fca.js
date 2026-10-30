function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function incidenceSet(context) {
  return new Set(context.incidences.map(([object, attribute]) => `${object}\u0000${attribute}`));
}

export function deriveAttributes(context, objects) {
  const selected = sortedUnique(objects);
  if (selected.length === 0) return sortedUnique(context.attributes);
  const incidences = incidenceSet(context);
  return sortedUnique(context.attributes.filter((attribute) => selected.every((object) => incidences.has(`${object}\u0000${attribute}`))));
}

export function deriveObjects(context, attributes) {
  const selected = sortedUnique(attributes);
  if (selected.length === 0) return sortedUnique(context.objects);
  const incidences = incidenceSet(context);
  return sortedUnique(context.objects.filter((object) => selected.every((attribute) => incidences.has(`${object}\u0000${attribute}`))));
}

export function closeAttributes(context, attributes) {
  return deriveAttributes(context, deriveObjects(context, attributes));
}

export function enumerateConcepts(context) {
  const attributes = sortedUnique(context.attributes);
  if (attributes.length > 20) throw new RangeError('完整概念枚举限于显式有限标签字典（最多 20 项）');
  const concepts = new Map();
  for (let mask = 0; mask < 2 ** attributes.length; mask++) {
    const candidate = attributes.filter((_, index) => mask & (1 << index));
    const intent = closeAttributes(context, candidate);
    const key = JSON.stringify(intent);
    if (!concepts.has(key)) concepts.set(key, { extent: deriveObjects(context, intent), intent });
  }
  return [...concepts.values()].sort((left, right) => left.intent.length - right.intent.length || JSON.stringify(left.intent).localeCompare(JSON.stringify(right.intent)));
}

export function validateFormalContext(artifact) {
  const context = artifact.context ?? artifact;
  const errors = [];
  if (artifact.context && artifact.complete !== true) errors.push('产物未声明完整枚举');
  if (artifact.context && artifact.truncated !== false) errors.push('产物声明被截断');
  if (new Set(context.objects ?? []).size !== (context.objects ?? []).length) errors.push('对象 ID 重复');
  if (new Set(context.attributes ?? []).size !== (context.attributes ?? []).length) errors.push('属性 ID 重复');
  const objects = new Set(context.objects ?? []);
  const attributes = new Set(context.attributes ?? []);
  const incidenceKeys = new Set();
  for (const [object, attribute] of context.incidences ?? []) {
    if (!objects.has(object) || !attributes.has(attribute)) errors.push(`悬空关联 ${object}/${attribute}`);
    const key = `${object}\u0000${attribute}`;
    if (incidenceKeys.has(key)) errors.push(`重复关联 ${object}/${attribute}`);
    incidenceKeys.add(key);
  }
  const concepts = enumerateConcepts(context);
  if (artifact.context && JSON.stringify(concepts) !== JSON.stringify(artifact.concepts)) errors.push('概念列表与完整枚举不一致');
  for (const concept of artifact.concepts ?? concepts) {
    if (JSON.stringify(deriveObjects(context, concept.intent)) !== JSON.stringify(concept.extent)
      || JSON.stringify(deriveAttributes(context, concept.extent)) !== JSON.stringify(concept.intent)) {
      errors.push(`概念闭包不一致: ${JSON.stringify(concept.intent)}`);
    }
  }
  if (artifact.summary) {
    const expected = {
      objects: context.objects.length,
      attributes: context.attributes.length,
      incidences: context.incidences.length,
      concepts: concepts.length
    };
    if (JSON.stringify(artifact.summary) !== JSON.stringify(expected)) errors.push('FCA 摘要计数不一致');
  }
  return { valid: errors.length === 0, errors, conceptCount: concepts.length };
}
