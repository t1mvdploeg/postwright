// Fields that belong together, such as a step and its explanation ("step2", "step2Text"): the
// number their ids end in says so. Only neighbours are joined, so the order of the template stays.
export function groupFields(fields) {
  const groups = [];
  for (const f of fields) {
    const number = /(\d+)[A-Za-z]*$/.exec(f.id)?.[1] ?? null;
    const last = groups.at(-1);
    if (number !== null && last?.number === number) last.fields.push(f);
    else groups.push({ number, fields: [f] });
  }
  return groups;
}
