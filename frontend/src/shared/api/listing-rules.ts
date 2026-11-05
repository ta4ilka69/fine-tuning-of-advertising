export type FieldRule = {
  type: string; enum?: readonly string[]; minimum?: number; maximum?: number; exclusiveMinimum?: number; pattern?: string; items?: { type: string; enum: readonly string[] }; uniqueItems?: boolean;
};

export const listingRules: Record<string, FieldRule> = {
  "deal.type": {
    "type": "string",
    "enum": [
      "sale",
      "rent",
      "daily_rent"
    ]
  },
  "deal.price": {
    "type": "integer",
    "minimum": 1
  },
  "deal.saleType": {
    "type": "string",
    "enum": [
      "free",
      "alternative"
    ]
  },
  "deal.mortgageAllowed": {
    "type": "boolean"
  },
  "deal.deposit": {
    "type": "integer",
    "minimum": 0
  },
  "deal.commissionPercent": {
    "type": "integer",
    "minimum": 0,
    "maximum": 100
  },
  "deal.prepayMonths": {
    "type": "integer",
    "minimum": 0
  },
  "deal.leaseTerm": {
    "type": "string",
    "enum": [
      "few_months",
      "long_term"
    ]
  },
  "deal.utilitiesIncluded": {
    "type": "boolean"
  },
  "deal.utilitiesPrice": {
    "type": "integer",
    "minimum": 0
  },
  "deal.metersNotIncluded": {
    "type": "boolean"
  },
  "object.type": {
    "type": "string",
    "enum": [
      "flat",
      "room",
      "house"
    ]
  },
  "object.totalArea": {
    "type": "number",
    "exclusiveMinimum": 0
  },
  "object.repairType": {
    "type": "string",
    "enum": [
      "cosmetic",
      "design",
      "euro",
      "no"
    ]
  },
  "object.isApartments": {
    "type": "boolean"
  },
  "object.isPenthouse": {
    "type": "boolean"
  },
  "object.isEuroFlat": {
    "type": "boolean"
  },
  "object.roomsCount": {
    "type": "integer",
    "minimum": 0
  },
  "object.roomType": {
    "type": "string",
    "enum": [
      "separate",
      "combined",
      "both"
    ]
  },
  "object.livingArea": {
    "type": "number",
    "exclusiveMinimum": 0
  },
  "object.kitchenArea": {
    "type": "number",
    "exclusiveMinimum": 0
  },
  "object.floor": {
    "type": "integer"
  },
  "object.balconiesCount": {
    "type": "integer",
    "minimum": 0
  },
  "object.loggiasCount": {
    "type": "integer",
    "minimum": 0
  },
  "object.windowsView": {
    "type": "string",
    "enum": [
      "street",
      "yard",
      "yard_and_street"
    ]
  },
  "object.separateWcsCount": {
    "type": "integer",
    "minimum": 0
  },
  "object.combinedWcsCount": {
    "type": "integer",
    "minimum": 0
  },
  "object.bedroomsCount": {
    "type": "integer",
    "minimum": 0
  },
  "object.wcsCount": {
    "type": "integer",
    "minimum": 0
  },
  "object.wcLocation": {
    "type": "string",
    "enum": [
      "indoors",
      "outdoors"
    ]
  },
  "building.floorsCount": {
    "type": "integer",
    "minimum": 1
  },
  "building.buildYear": {
    "type": "integer",
    "minimum": 1
  },
  "building.materialType": {
    "type": "string",
    "enum": [
      "block",
      "boards",
      "brick",
      "monolith",
      "monolith_brick",
      "old",
      "panel",
      "stalin",
      "wood",
      "wireframe",
      "aerocrete_block",
      "gas_silicate_block",
      "foam_concrete_block"
    ]
  },
  "building.ceilingHeight": {
    "type": "number",
    "exclusiveMinimum": 0
  },
  "building.passengerLiftsCount": {
    "type": "integer",
    "minimum": 0
  },
  "building.cargoLiftsCount": {
    "type": "integer",
    "minimum": 0
  },
  "building.hasGarbageChute": {
    "type": "boolean"
  },
  "building.parkingType": {
    "type": "string",
    "enum": [
      "ground",
      "multilevel",
      "roof",
      "underground",
      "open"
    ]
  },
  "building.hasBarrierYard": {
    "type": "boolean"
  },
  "building.hasCarFreeCourt": {
    "type": "boolean"
  },
  "building.hasConcierge": {
    "type": "boolean"
  },
  "house.floorsCount": {
    "type": "integer",
    "minimum": 1
  },
  "house.buildYear": {
    "type": "integer",
    "minimum": 1
  },
  "house.isDacha": {
    "type": "boolean"
  },
  "house.materialTypes": {
    "type": "array",
    "uniqueItems": true,
    "items": {
      "type": "string",
      "enum": [
        "boards",
        "brick",
        "monolith",
        "wood",
        "wireframe",
        "aerocrete_block",
        "gas_silicate_block",
        "foam_concrete_block",
        "solid_wood",
        "glued_laminated_timber",
        "sip_panels",
        "reinforced_concrete_panels",
        "metal_frame",
        "expanded_clay_concrete",
        "slag_concrete",
        "arbolit"
      ]
    }
  },
  "house.condition": {
    "type": "string",
    "enum": [
      "ready",
      "interior_decoration_required",
      "unfinished",
      "major_repairs_required"
    ]
  },
  "house.heatingType": {
    "type": "string",
    "enum": [
      "fireplace",
      "no",
      "stove",
      "central_gas",
      "central_coal",
      "electric",
      "autonomous_gas",
      "diesel",
      "solid_fuel_boiler"
    ]
  },
  "house.gasType": {
    "type": "string",
    "enum": [
      "main",
      "border",
      "gas_holder",
      "gas_bottle"
    ]
  },
  "house.waterType": {
    "type": "string",
    "enum": [
      "central",
      "borehole",
      "well"
    ]
  },
  "house.drainageType": {
    "type": "string",
    "enum": [
      "central",
      "septic_tank",
      "cesspool"
    ]
  },
  "house.hasElectricity": {
    "type": "boolean"
  },
  "house.hasTerrace": {
    "type": "boolean"
  },
  "house.hasCellar": {
    "type": "boolean"
  },
  "house.hasBathhouse": {
    "type": "boolean"
  },
  "house.hasGarage": {
    "type": "boolean"
  },
  "house.hasPool": {
    "type": "boolean"
  },
  "house.hasSecurity": {
    "type": "boolean"
  },
  "house.landArea": {
    "type": "number",
    "exclusiveMinimum": 0
  },
  "house.landAreaUnit": {
    "type": "string",
    "enum": [
      "sotka",
      "hectare"
    ]
  },
  "house.landUseType": {
    "type": "string",
    "enum": [
      "farm",
      "private_farm",
      "gardening",
      "individual_housing_construction",
      "suburban_non_profit_partnership",
      "horticulture",
      "other"
    ]
  },
  "house.landCategory": {
    "type": "string",
    "enum": [
      "for_agricultural_purposes",
      "settlements",
      "other"
    ]
  },
  "amenities.hasFurniture": {
    "type": "boolean"
  },
  "amenities.hasKitchenFurniture": {
    "type": "boolean"
  },
  "amenities.hasFridge": {
    "type": "boolean"
  },
  "amenities.hasWasher": {
    "type": "boolean"
  },
  "amenities.hasDishwasher": {
    "type": "boolean"
  },
  "amenities.hasConditioner": {
    "type": "boolean"
  },
  "amenities.hasTv": {
    "type": "boolean"
  },
  "amenities.hasInternet": {
    "type": "boolean"
  },
  "amenities.hasBathtub": {
    "type": "boolean"
  },
  "amenities.hasShower": {
    "type": "boolean"
  },
  "rules.childrenAllowed": {
    "type": "boolean"
  },
  "rules.petsAllowed": {
    "type": "boolean"
  },
  "rules.bedsCount": {
    "type": "integer",
    "minimum": 1
  },
  "rules.guestsCount": {
    "type": "integer",
    "minimum": 1
  },
  "rules.checkInTime": {
    "type": "string",
    "pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$"
  },
  "rules.checkOutTime": {
    "type": "string",
    "pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$"
  },
  "rules.smoking": {
    "type": "string",
    "enum": [
      "allowed",
      "forbidden",
      "designated_areas_only"
    ]
  },
  "rules.parties": {
    "type": "string",
    "enum": [
      "allowed",
      "forbidden",
      "by_agreement"
    ]
  },
  "rules.contactlessCheckin": {
    "type": "boolean"
  },
  "legal.hasRedevelopment": {
    "type": "boolean"
  },
  "legal.hasMinorOwners": {
    "type": "boolean"
  },
  "legal.maternityCapitalUsed": {
    "type": "boolean"
  },
  "underground.name": {
    "type": "string",
    "pattern": "\\S"
  },
  "underground.minutes": {
    "type": "integer",
    "minimum": 0
  },
  "underground.transportType": {
    "type": "string",
    "enum": [
      "walk",
      "transport"
    ]
  },
  "location.address": {
    "type": "string",
    "pattern": "\\S"
  },
  "extra": {
    "type": "string",
    "pattern": "\\S"
  }
};
