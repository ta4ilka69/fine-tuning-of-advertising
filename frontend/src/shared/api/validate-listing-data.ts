import { isRecord } from './errors';
import type { ListingData } from './listing-data';
import { listingRules, type FieldRule } from './listing-rules';

const flatOnly = ['isApartments', 'isPenthouse', 'isEuroFlat', 'roomsCount', 'roomType'];
const apartmentOnly = ['livingArea', 'kitchenArea', 'floor', 'balconiesCount', 'loggiasCount', 'windowsView', 'separateWcsCount', 'combinedWcsCount'];
const houseOnly = ['bedroomsCount', 'wcsCount', 'wcLocation'];
const rentOnly = ['commissionPercent', 'prepayMonths', 'leaseTerm', 'utilitiesIncluded', 'utilitiesPrice', 'metersNotIncluded'];
const saleOnly = ['saleType', 'mortgageAllowed'];
const dailyOnly = ['bedsCount', 'guestsCount', 'checkInTime', 'checkOutTime', 'smoking', 'parties', 'contactlessCheckin'];

export function applicableField(path: string, deal?: string, object?: string) {
  const [block, field = ''] = path.split('.');
  if (object === 'house' && (block === 'building' || (block === 'object' && [...flatOnly, ...apartmentOnly].includes(field)))) return false;
  if ((object === 'flat' || object === 'room') && (block === 'house' || (block === 'object' && houseOnly.includes(field)))) return false;
  if (object === 'room' && block === 'object' && flatOnly.includes(field)) return false;
  if ((object === 'house' || object === 'room') && path === 'legal.hasRedevelopment') return false;
  if (deal === 'sale' && (block === 'amenities' || block === 'rules' || (block === 'deal' && ['deposit', ...rentOnly].includes(field)))) return false;
  if ((deal === 'rent' || deal === 'daily_rent') && (block === 'legal' || (block === 'deal' && saleOnly.includes(field)))) return false;
  if (deal === 'daily_rent' && block === 'deal' && rentOnly.includes(field)) return false;
  if (deal === 'rent' && block === 'rules' && dailyOnly.includes(field)) return false;
  return true;
}

export function validField(value: unknown, rule: FieldRule): boolean {
  if (rule.type === 'array') return Array.isArray(value) && new Set(value).size === value.length
    && value.every((item) => typeof item === 'string' && rule.items!.enum.includes(item));
  if (rule.type === 'integer' || rule.type === 'number') return typeof value === 'number' && Number.isFinite(value)
    && Math.abs(value) <= Number.MAX_SAFE_INTEGER && (rule.type !== 'integer' || Number.isSafeInteger(value))
    && (rule.minimum === undefined || value >= rule.minimum) && (rule.maximum === undefined || value <= rule.maximum)
    && (rule.exclusiveMinimum === undefined || value > rule.exclusiveMinimum);
  if (rule.type === 'boolean') return typeof value === 'boolean';
  return typeof value === 'string' && (!rule.enum || rule.enum.includes(value)) && (!rule.pattern || new RegExp(rule.pattern).test(value));
}

export function isListingData(value: unknown): value is ListingData {
  if (!isRecord(value)) return false;
  const deal = isRecord(value.deal) && typeof value.deal.type === 'string' ? value.deal.type : undefined;
  const object = isRecord(value.object) && typeof value.object.type === 'string' ? value.object.type : undefined;
  return Object.entries(value).every(([block, data]) => {
    if (block === 'extra') return validField(data, listingRules.extra!);
    if (!['deal', 'object', 'building', 'house', 'amenities', 'rules', 'legal', 'location'].includes(block)
      || !isRecord(data) || !applicableField(block, deal, object)) return false;
    return Object.entries(data).every(([key, field]) => {
      if (block === 'location' && key === 'undergrounds') return Array.isArray(field) && field.every((station) => isRecord(station)
        && typeof station.name === 'string' && /\S/.test(station.name)
        && Object.entries(station).every(([name, item]) => !!listingRules[`underground.${name}`] && validField(item, listingRules[`underground.${name}`]!)));
      const path = `${block}.${key}`;
      return !!listingRules[path] && applicableField(path, deal, object) && validField(field, listingRules[path]!);
    });
  });
}
