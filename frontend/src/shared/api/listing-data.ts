export type ListingDeal = {
  type?: 'sale' | 'rent' | 'daily_rent';
  price?: number;
  saleType?: 'free' | 'alternative';
  mortgageAllowed?: boolean;
  deposit?: number;
  commissionPercent?: number;
  prepayMonths?: number;
  leaseTerm?: 'few_months' | 'long_term';
  utilitiesIncluded?: boolean;
  utilitiesPrice?: number;
  metersNotIncluded?: boolean;
};

export type ListingObject = {
  type?: 'flat' | 'room' | 'house';
  totalArea?: number;
  repairType?: 'cosmetic' | 'design' | 'euro' | 'no';
  isApartments?: boolean;
  isPenthouse?: boolean;
  isEuroFlat?: boolean;
  roomsCount?: number;
  roomType?: 'separate' | 'combined' | 'both';
  livingArea?: number;
  kitchenArea?: number;
  floor?: number;
  balconiesCount?: number;
  loggiasCount?: number;
  windowsView?: 'street' | 'yard' | 'yard_and_street';
  separateWcsCount?: number;
  combinedWcsCount?: number;
  bedroomsCount?: number;
  wcsCount?: number;
  wcLocation?: 'indoors' | 'outdoors';
};

export type ListingBuilding = {
  floorsCount?: number;
  buildYear?: number;
  materialType?: 'block' | 'boards' | 'brick' | 'monolith' | 'monolith_brick' | 'old' | 'panel' | 'stalin' | 'wood' | 'wireframe' | 'aerocrete_block' | 'gas_silicate_block' | 'foam_concrete_block';
  ceilingHeight?: number;
  passengerLiftsCount?: number;
  cargoLiftsCount?: number;
  hasGarbageChute?: boolean;
  parkingType?: 'ground' | 'multilevel' | 'roof' | 'underground' | 'open';
  hasBarrierYard?: boolean;
  hasCarFreeCourt?: boolean;
  hasConcierge?: boolean;
};

export type ListingHouse = {
  floorsCount?: number;
  buildYear?: number;
  isDacha?: boolean;
  materialTypes?: ('boards' | 'brick' | 'monolith' | 'wood' | 'wireframe' | 'aerocrete_block' | 'gas_silicate_block' | 'foam_concrete_block' | 'solid_wood' | 'glued_laminated_timber' | 'sip_panels' | 'reinforced_concrete_panels' | 'metal_frame' | 'expanded_clay_concrete' | 'slag_concrete' | 'arbolit')[];
  condition?: 'ready' | 'interior_decoration_required' | 'unfinished' | 'major_repairs_required';
  heatingType?: 'fireplace' | 'no' | 'stove' | 'central_gas' | 'central_coal' | 'electric' | 'autonomous_gas' | 'diesel' | 'solid_fuel_boiler';
  gasType?: 'main' | 'border' | 'gas_holder' | 'gas_bottle';
  waterType?: 'central' | 'borehole' | 'well';
  drainageType?: 'central' | 'septic_tank' | 'cesspool';
  hasElectricity?: boolean;
  hasTerrace?: boolean;
  hasCellar?: boolean;
  hasBathhouse?: boolean;
  hasGarage?: boolean;
  hasPool?: boolean;
  hasSecurity?: boolean;
  landArea?: number;
  landAreaUnit?: 'sotka' | 'hectare';
  landUseType?: 'farm' | 'private_farm' | 'gardening' | 'individual_housing_construction' | 'suburban_non_profit_partnership' | 'horticulture' | 'other';
  landCategory?: 'for_agricultural_purposes' | 'settlements' | 'other';
};

export type ListingAmenities = {
  hasFurniture?: boolean;
  hasKitchenFurniture?: boolean;
  hasFridge?: boolean;
  hasWasher?: boolean;
  hasDishwasher?: boolean;
  hasConditioner?: boolean;
  hasTv?: boolean;
  hasInternet?: boolean;
  hasBathtub?: boolean;
  hasShower?: boolean;
};

export type ListingRules = {
  childrenAllowed?: boolean;
  petsAllowed?: boolean;
  bedsCount?: number;
  guestsCount?: number;
  checkInTime?: string;
  checkOutTime?: string;
  smoking?: 'allowed' | 'forbidden' | 'designated_areas_only';
  parties?: 'allowed' | 'forbidden' | 'by_agreement';
  contactlessCheckin?: boolean;
};

export type ListingLegal = {
  hasRedevelopment?: boolean;
  hasMinorOwners?: boolean;
  maternityCapitalUsed?: boolean;
};

export type ListingUnderground = {
  name: string;
  minutes?: number;
  transportType?: 'walk' | 'transport';
};

export type ListingLocation = {
  address?: string;
  undergrounds?: (ListingUnderground)[];
};

export type ListingData = {
  deal?: ListingDeal;
  object?: ListingObject;
  building?: ListingBuilding;
  house?: ListingHouse;
  amenities?: ListingAmenities;
  rules?: ListingRules;
  legal?: ListingLegal;
  location?: ListingLocation;
  extra?: string;
};
