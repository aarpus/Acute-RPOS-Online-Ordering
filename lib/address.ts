import { emptyCustomer, type Customer } from './order';

export const usStates = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
export const zipPattern = /^[0-9]{5}(?:-[0-9]{4})?$/;
export function validUSState(state: unknown): state is string {
  return typeof state === 'string' && Object.hasOwn(usStates, state);
}
export type AddressInput = {
  shippingName: string; shippingPhone: string; flatHouseNo: string; areaStreet: string;
  landmark: string | null; city: string; state: string; country: string; pincode: string;
  addressType: string; deliveryInstructions: string | null; isDefault: boolean;
};
export type SavedAddress = AddressInput & { id: string };
export const blankAddress: SavedAddress = {
  id: '', shippingName: '', shippingPhone: '', flatHouseNo: '', areaStreet: '', landmark: '',
  city: '', state: '', country: 'US', pincode: '', addressType: 'Home', deliveryInstructions: '', isDefault: false,
};
export function addressCustomer(address: SavedAddress): Customer {
  return { name: address.shippingName, phone: address.shippingPhone, street: address.areaStreet,
    apartment: address.flatHouseNo, city: address.city, state: address.state, country: 'US',
    postalCode: address.pincode, landmark: address.landmark || '', instructions: address.deliveryInstructions || '' };
}
export function customerForUser(previous: Customer, ownerId: string, user: { id: string; firstName: string; lastName: string; phoneNumber: string }): Customer {
  const draft = ownerId === user.id ? previous : emptyCustomer;
  return { ...draft, name: draft.name || `${user.firstName} ${user.lastName}`.trim(), phone: draft.phone || user.phoneNumber };
}
export function validateAddress(value: unknown): AddressInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Enter address details.');
  const body = value as Record<string, unknown>;
  function text(key: string, max: number, required = true) {
    const value = body[key] ?? '';
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw Error(`Enter a valid ${key} (maximum ${max} characters).`);
    return value.trim();
  }
  const state = text('state', 100);
  const pincode = text('pincode', 25);
  const shippingPhone = text('shippingPhone', 25);
  if (!validUSState(state)) throw Error('Select a US state.');
  if (!zipPattern.test(pincode)) throw Error('Enter a US ZIP Code (12345 or 12345-6789).');
  if (!/^[+0-9 ()-]{7,25}$/.test(shippingPhone) || shippingPhone.replace(/\D/g, '').length < 7) throw Error('Enter a valid phone number.');
  if (body.country !== undefined && body.country !== 'US') throw Error('Only US addresses are supported.');
  if (body.isDefault !== undefined && typeof body.isDefault !== 'boolean') throw Error('Invalid default address setting.');
  return { shippingName: text('shippingName', 100), shippingPhone, flatHouseNo: text('flatHouseNo', 150), areaStreet: text('areaStreet', 200),
    landmark: text('landmark', 150, false) || null, city: text('city', 100), state, country: 'US', pincode,
    addressType: body.addressType === undefined ? 'Home' : text('addressType', 20),
    deliveryInstructions: text('deliveryInstructions', 200, false) || null, isDefault: body.isDefault === true };
}
