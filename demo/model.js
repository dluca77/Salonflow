/* Fictional, in-memory state. No network, storage, messages or payment provider. */
(function (root) {
  const slots = ["09:30", "11:00", "14:30"];
  const initial = () => ({
    time: "11:00",
    booked: false,
    paid: false,
    productQuantity: 0,
    method: "Pin",
    receipt: null,
  });
  const total = (s) => 7200 + s.productQuantity * 1850;
  function reduce(s, action) {
    switch (action.type) {
      case "reset":
        return initial();
      case "time":
        return !s.paid && slots.includes(action.value)
          ? { ...s, time: action.value }
          : s;
      case "book":
        return !s.booked ? { ...s, booked: true } : s;
      case "quantity":
        return s.booked && !s.paid
          ? {
              ...s,
              productQuantity: Math.max(
                0,
                Math.min(3, s.productQuantity + action.delta),
              ),
            }
          : s;
      case "method":
        return !s.paid && ["Pin", "Contant"].includes(action.value)
          ? { ...s, method: action.value }
          : s;
      case "pay":
        return s.booked && !s.paid
          ? {
              ...s,
              paid: true,
              receipt: {
                cents: total(s),
                method: s.method,
                quantity: s.productQuantity,
                time: s.time,
              },
            }
          : s;
      default:
        return s;
    }
  }
  const api = { initial, reduce, total, slots };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KronrDemo = api;
})(typeof window !== "undefined" ? window : globalThis);
