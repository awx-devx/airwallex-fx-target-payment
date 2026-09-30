import { en, Faker } from '@faker-js/faker';
import type { Corridor } from '@/mocks/generators/corridors';

export interface Vendor {
  name: string;
  country: string;
  email: string;
  taxId: string;
  city: string;
  street: string;
}

export function generateVendor(
  seed: number,
  index: number,
  corridor: Corridor,
): Vendor {
  const faker = new Faker({ locale: [en] });
  faker.seed(seed * 10007 + index + 1);
  const raw = faker.company.name().replace(/\s+(Inc|LLC|Ltd|GmbH|AG)\.?$/i, '');
  const name = `${raw} ${corridor.legalSuffix}`.replace(/\s+/g, ' ').trim();
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return {
    name,
    country: corridor.country,
    email: `billing@${slug || `vendor-${index}`}.example`,
    taxId: `${corridor.country}${String(seed + index)
      .padStart(9, '0')
      .slice(0, 9)}`,
    city: faker.location.city(),
    street: faker.location.streetAddress(),
  };
}
