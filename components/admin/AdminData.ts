export type Store = { id: string; name: string; domain: string; status: 'Active' | 'Paused'; orders: number; provider: string; color: string };
export type Order = { id: string; store: string; amount: string; payment: 'Paid' | 'Failed'; pos: 'Success' | 'Retrying'; fulfillment: 'Accepted' | 'Pending'; customer: string; time: string };

export const stores: Store[] = [
  { id: 'spice-table', name: 'Spice Table', domain: 'spicetable.acutepos.com', status: 'Active', orders: 642, provider: 'Square POS', color: '#b51f3c' },
  { id: 'urban-pizza', name: 'Urban Pizza', domain: 'urbanpizza.acutepos.com', status: 'Active', orders: 518, provider: 'Toast POS', color: '#f36d37' },
  { id: 'green-bowl', name: 'Green Bowl', domain: 'greenbowl.acutepos.com', status: 'Active', orders: 311, provider: 'Clover POS', color: '#2f8d46' },
  { id: 'taco-district', name: 'Taco District', domain: 'tacodistrict.acutepos.com', status: 'Active', orders: 276, provider: 'Square POS', color: '#e8bb22' },
  { id: 'noodle-house', name: 'Noodle House', domain: 'noodlehouse.acutepos.com', status: 'Active', orders: 148, provider: 'Toast POS', color: '#ef5f78' },
  { id: 'sushi-corner', name: 'Sushi Corner', domain: 'sushicorner.acutepos.com', status: 'Paused', orders: 164, provider: 'Clover POS', color: '#d94b62' },
];

export const orders: Order[] = [
  { id: '#OH-284751', store: 'Spice Table', amount: '$42.80', payment: 'Paid', pos: 'Retrying', fulfillment: 'Pending', customer: 'Alex R.', time: 'Oct 27, 2026 10:24 AM' },
  { id: '#OH-284750', store: 'Urban Pizza', amount: '$27.15', payment: 'Paid', pos: 'Success', fulfillment: 'Accepted', customer: 'Maya K.', time: 'Oct 27, 2026 10:16 AM' },
  { id: '#OH-284749', store: 'Green Bowl', amount: '$36.40', payment: 'Paid', pos: 'Success', fulfillment: 'Accepted', customer: 'Jordan L.', time: 'Oct 27, 2026 10:12 AM' },
  { id: '#OH-284748', store: 'Spice Table', amount: '$18.25', payment: 'Paid', pos: 'Success', fulfillment: 'Accepted', customer: 'Sam P.', time: 'Oct 27, 2026 9:56 AM' },
  { id: '#OH-284747', store: 'Taco District', amount: '$31.10', payment: 'Paid', pos: 'Retrying', fulfillment: 'Pending', customer: 'Taylor M.', time: 'Oct 27, 2026 9:43 AM' },
  { id: '#OH-284746', store: 'Noodle House', amount: '$19.35', payment: 'Paid', pos: 'Success', fulfillment: 'Accepted', customer: 'Chris B.', time: 'Oct 27, 2026 9:21 AM' },
  { id: '#OH-284745', store: 'Urban Pizza', amount: '$26.90', payment: 'Failed', pos: 'Success', fulfillment: 'Accepted', customer: 'Riya S.', time: 'Oct 27, 2026 9:10 AM' },
];
