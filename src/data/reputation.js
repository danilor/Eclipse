// Reputation Tile bag: 33 tiles in total.
export function buildReputationBag() {
  const bag = [];
  const add = (value, count) => {
    for (let i = 0; i < count; i++) bag.push(value);
  };
  add(4, 4);
  add(3, 7);
  add(2, 10);
  add(1, 12);
  return bag;
}
