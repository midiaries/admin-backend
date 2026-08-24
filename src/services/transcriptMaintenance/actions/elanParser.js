const { XMLParser } = require('fast-xml-parser');

const MAX_REF_DEPTH = 20;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

const toArray = value => {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const msToSeconds = ms => Number((ms / 1000).toFixed(2));

const annotationValue = node => {
  const raw = node && node.ANNOTATION_VALUE;
  if (raw === undefined || raw === null) {
    return '';
  }
  if (typeof raw === 'object') {
    return typeof raw['#text'] === 'string' ? raw['#text'].trim() : '';
  }
  return String(raw).trim();
};

const parseTiers = xml => {
  const parsed = xmlParser.parse(xml);
  if (!parsed || !Object.prototype.hasOwnProperty.call(parsed, 'ANNOTATION_DOCUMENT')) {
    throw new Error('Not a valid ELAN document: missing ANNOTATION_DOCUMENT');
  }
  const doc = parsed.ANNOTATION_DOCUMENT || {};

  const timeSlots = {};
  toArray(doc.TIME_ORDER && doc.TIME_ORDER.TIME_SLOT).forEach(ts => {
    const id = ts['@_TIME_SLOT_ID'];
    const value = ts['@_TIME_VALUE'];
    if (id !== undefined && value !== undefined) {
      timeSlots[id] = Number(value);
    }
  });

  const tierNodes = toArray(doc.TIER);

  const boundsById = {};
  const refParentById = {};
  tierNodes.forEach(tierNode => {
    toArray(tierNode.ANNOTATION).forEach(wrapper => {
      toArray(wrapper.ALIGNABLE_ANNOTATION).forEach(node => {
        const start = timeSlots[node['@_TIME_SLOT_REF1']];
        const end = timeSlots[node['@_TIME_SLOT_REF2']];
        if (start !== undefined && end !== undefined) {
          boundsById[node['@_ANNOTATION_ID']] = { startMs: start, endMs: end };
        }
      });
      toArray(wrapper.REF_ANNOTATION).forEach(node => {
        refParentById[node['@_ANNOTATION_ID']] = node['@_ANNOTATION_REF'];
      });
    });
  });

  const resolveRef = annotationId => {
    let current = annotationId;
    for (let depth = 0; depth < MAX_REF_DEPTH; depth += 1) {
      if (boundsById[current]) {
        return boundsById[current];
      }
      const parent = refParentById[current];
      if (parent === undefined) {
        return undefined;
      }
      current = parent;
    }
    return undefined;
  };

  return tierNodes.map(tierNode => {
    const annotations = [];
    toArray(tierNode.ANNOTATION).forEach(wrapper => {
      toArray(wrapper.ALIGNABLE_ANNOTATION).forEach(node => {
        const value = annotationValue(node);
        const bounds = boundsById[node['@_ANNOTATION_ID']];
        if (value && bounds) {
          annotations.push({ startMs: bounds.startMs, endMs: bounds.endMs, value });
        }
      });
      toArray(wrapper.REF_ANNOTATION).forEach(node => {
        const value = annotationValue(node);
        const bounds = resolveRef(node['@_ANNOTATION_ID']);
        if (value && bounds) {
          annotations.push({ startMs: bounds.startMs, endMs: bounds.endMs, value });
        }
      });
    });

    return {
      tierId: tierNode['@_TIER_ID'],
      participant: tierNode['@_PARTICIPANT'],
      annotator: tierNode['@_ANNOTATOR'],
      annotations,
    };
  });
};

const buildGroups = (tiers, tierMap) => {
  if (!Array.isArray(tierMap) || !tierMap.length) {
    throw new Error('buildGroups requires a tierMap: tier grouping is never inferred');
  }

  const tierOrder = {};
  tiers.forEach((t, idx) => { tierOrder[t.tierId] = idx; });

  return toArray(tierMap).map(group => {
    const sentences = [];

    toArray(group.tiers).forEach(entry => {
      const tier = tiers.find(t => t.tierId === entry.tierId);
      if (!tier) {
        throw new Error(`ELAN tier not found in file: ${entry.tierId}`);
      }
      const speaker = Number(entry.speaker);
      if (!isFinite(speaker)) {
        throw new Error(`ELAN tier ${entry.tierId} has a non-numeric speaker: ${entry.speaker}`);
      }
      const header2 = entry.header2 === undefined ? entry.tierId : entry.header2;

      tier.annotations.forEach(annotation => {
        sentences.push({
          startTime: msToSeconds(annotation.startMs),
          endTime: msToSeconds(annotation.endMs),
          content: annotation.value,
          metadata: { speaker, header2 },
          _order: tierOrder[entry.tierId],
        });
      });
    });

    sentences.sort((a, b) => {
      if (a.startTime !== b.startTime) {
        return a.startTime - b.startTime;
      }
      if (a.endTime !== b.endTime) {
        return a.endTime - b.endTime;
      }
      return a._order - b._order;
    });
    sentences.forEach(s => { delete s._order; });

    return { label: group.label, sentences };
  });
};

module.exports = {
  parseTiers,
  buildGroups,
  msToSeconds,
};
