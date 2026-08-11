// Runtime correction for the imported civilization atlases.
// The source atlases are valid; this fixes which prefab is assigned to each gameplay building type.

const correctedBuildingSpec = String.raw`  civilizationBuildingSpec(b,k){
    const pick=arr=>arr[Math.floor(hash(b.cell.col,b.cell.row,k.id+arr.length)*arr.length)%arr.length];
    const map={
      castle:[['castle'],56],
      city:[['civic_dome'],39],
      village:[['house_03','house_04','house_06'],27],
      house:[['house_01','house_02','house_03','house_04','house_05','house_06'],23],
      farm:[['farm'],30],
      market:[['market'],29],
      tower:[['guard_tower','royal_tower','beacon_tower'],24],
      dock:[['harbor_crane','pier_01','pier_02'],31],
      palisade:[['gate','palisade'],28],
      lumbermill:[['windmill'],28],
      quarry:[['workshop_mine'],28],
      blacksmith:[['blacksmith'],27],
      barracks:[['guard_tower','catapult'],25],
      stable:[['house_05','house_06'],24],
      chapel:[['cathedral'],34]
    };
    const spec=map[b.type]||map.house;
    return {name:pick(spec[0]),width:spec[1]};
  }
  civilizationBuildingSprite(`;

export function patchCivilizationAssetMappings(source){
  const specPattern=/  civilizationBuildingSpec\(b,k\)\{[\s\S]*?\n  \}\n  civilizationBuildingSprite\(/;
  if(!specPattern.test(source))throw new Error('Civilization asset fix could not find building mapping');
  let patched=source.replace(specPattern,correctedBuildingSpec);

  // The legacy fallback table was written when only red/blue assets were available.
  // All ten civilization atlases now exist, so keep one neutral fallback instead of special-casing two themes.
  patched=patched.replace("const theme=this.kingdomTheme(k),themed=theme==='red'||theme==='blue';","const theme=this.kingdomTheme(k),themed=true;");
  return patched;
}
