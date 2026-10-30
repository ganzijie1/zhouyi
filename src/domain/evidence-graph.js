function adjacency(edges) {
  const map = new Map();
  for (const edge of edges) {
    if (!map.has(edge.from)) map.set(edge.from, []);
    map.get(edge.from).push(edge.to);
  }
  return map;
}

function reachesKind(start, nodesById, outgoing, acceptedKinds) {
  const queue = [start];
  const seen = new Set(queue);
  while (queue.length) {
    const id = queue.shift();
    if (id !== start && acceptedKinds.has(nodesById.get(id)?.kind)) return true;
    for (const next of outgoing.get(id) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  }
  return false;
}

export function validateEvidenceGraph(graph) {
  const nodes = graph.nodes ?? [];
  const edges = graph.edges ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const duplicateNodeIds = nodes.filter((node, index) => nodes.findIndex((candidate) => candidate.id === node.id) !== index).map((node) => node.id);
  const edgeKeys = edges.map((edge) => `${edge.from}\u0000${edge.type}\u0000${edge.to}`);
  const duplicateEdges = edges.filter((_, index) => edgeKeys.indexOf(edgeKeys[index]) !== index);
  const allowed = graph.allowedEdgeTypes ?? [];
  const danglingEdges = edges.filter((edge) => !byId.has(edge.from) || !byId.has(edge.to));
  const invalidTypeEdges = edges.filter((edge) => allowed.length && !allowed.includes(edge.type));
  const outgoing = adjacency(edges);
  const paragraphs = nodes.filter((node) => node.kind === 'paragraph');
  const claims = nodes.filter((node) => node.kind === 'claim');
  const paragraphsWithoutSourcePath = paragraphs.filter((node) => !reachesKind(node.id, byId, outgoing, new Set(['source']))).map((node) => node.id);
  const claimsWithoutEvidencePath = claims.filter((node) => !reachesKind(node.id, byId, outgoing, new Set(['proof', 'paragraph', 'source', 'artifact']))).map((node) => node.id);
  const directEvidence = new Set(edges.filter((edge) => edge.type === 'supported-by').map((edge) => `${edge.from}\u0000${edge.to}`));
  const directDependencies = new Set(edges.filter((edge) => edge.type === 'depends-on').map((edge) => `${edge.from}\u0000${edge.to}`));
  const claimsWithMissingRequiredEvidence = claims.flatMap((node) => (node.requiredEvidenceIds ?? [])
    .filter((id) => !directEvidence.has(`${node.id}\u0000${id}`))
    .map((id) => ({ claim: node.id, evidence: id })));
  const nodesWithMissingRequiredInputs = nodes.flatMap((node) => (node.requiredInputIds ?? [])
    .filter((id) => !directDependencies.has(`${node.id}\u0000${id}`))
    .map((id) => ({ node: node.id, input: id })));
  return {
    valid: duplicateNodeIds.length + duplicateEdges.length + danglingEdges.length + invalidTypeEdges.length
      + paragraphsWithoutSourcePath.length + claimsWithoutEvidencePath.length + claimsWithMissingRequiredEvidence.length
      + nodesWithMissingRequiredInputs.length === 0,
    duplicateNodeIds, duplicateEdges, danglingEdges, invalidTypeEdges, paragraphsWithoutSourcePath, claimsWithoutEvidencePath,
    claimsWithMissingRequiredEvidence, nodesWithMissingRequiredInputs,
    sourceReachabilityRatio: paragraphs.length ? (paragraphs.length - paragraphsWithoutSourcePath.length) / paragraphs.length : 1,
    claimEvidenceReachabilityRatio: claims.length ? (claims.length - claimsWithoutEvidencePath.length) / claims.length : 1
  };
}

function detectCycles(nodes, edges) {
  const outgoing = adjacency(edges);
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  function visit(id, path) {
    if (visiting.has(id)) { cycles.push([...path.slice(path.indexOf(id)), id]); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of outgoing.get(id) ?? []) visit(next, [...path, next]);
    visiting.delete(id); visited.add(id);
  }
  for (const node of nodes) visit(node.id, [node.id]);
  return cycles;
}

export function validateAxiomGraph(graph) {
  const nodes = graph.nodes ?? [];
  const edges = graph.edges ?? [];
  const ids = new Set(nodes.map((node) => node.id));
  const missingDependencies = edges.filter((edge) => !ids.has(edge.from) || !ids.has(edge.to));
  const validEdges = edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  const cycles = detectCycles(nodes, validEdges);
  const outgoing = adjacency(validEdges);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const rootlessClaims = nodes.filter((node) => node.kind === 'claim' && !reachesKind(node.id, byId, outgoing, new Set(['axiom', 'source']))).map((node) => node.id);
  return { valid: missingDependencies.length + cycles.length + rootlessClaims.length === 0, missingDependencies, cycles, rootlessClaims };
}
