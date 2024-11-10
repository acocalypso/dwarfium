import {
  ObjectStellarium,
  AstroObject,
  ObjectOpenNGC,
  ObjectTelescopius,
} from "@/types";
import { formatObjectNameStellarium, catalogs } from "@/lib/stellarium_utils";
import { typesTypesCategories } from "../../data/objectTypes";
import { abbrevNameConstellations } from "../../data/constellations";
import { convertDMSToDwarfDec, convertHMSToDwarfRA } from "@/lib/math_utils";

function formatObjectStellarium(object: ObjectStellarium): AstroObject {
  let data = {
    dec: object.dec,
    designation: object.designation,
    magnitude: object.magnitude,
    type: object.objtype,
    typeCategory:
      typesTypesCategories[object.objtype as keyof typeof typesTypesCategories],
    ra: object.ra,
    displayName: formatObjectNameStellarium(object),
    alternateNames: "",
    constellation:
      abbrevNameConstellations[
        object.constellation as keyof typeof abbrevNameConstellations
      ],
    notes: "",
    favorite: false,
  } as AstroObject;

  if (object.designation) {
    let parts = object.designation.split(" ");
    if (catalogs.includes(parts[0]) && parts.length === 2) {
      data.catalogue = parts[0];
      data.objectNumber = Number(parts[1]);
    } else {
      data.catalogue = object.designation;
      data.objectNumber = -1;
    }
  }
  return data;
}

export function processObjectListStellarium(
  objects: ObjectStellarium[]
): AstroObject[] {
  let formattedObjects = objects.map(formatObjectStellarium);
  let noCatalogObjects = formattedObjects
    .filter((obj) => obj.objectNumber == -1)
    .sort((a, b) => a.catalogue.localeCompare(b.catalogue));
  let catalogObjects = formattedObjects
    .filter((obj) => obj.objectNumber !== -1)
    .sort((a, b) => {
      return (
        a.catalogue.localeCompare(b.catalogue) ||
        a.objectNumber - b.objectNumber
      );
    });

  return noCatalogObjects.concat(catalogObjects);
}

export function processObjectListOpenNGC(objects: ObjectOpenNGC[]) {
  console.debug("Create Objects List Objects");
  return objects
    .map((object) => {
      return {
        dec: formatOpenNGCDec(object.Declination),
        designation: object["Catalogue Entry"],
        magnitude: object.Magnitude,
        type: object.Type,
        typeCategory: object["Type Category"],
        ra: formatOpenNGCRA(object["Right Ascension"]),
        displayName: formatObjectNameOpenNGC(object),
        alternateNames: object["Alternative Entries"],
        catalogue: object["Name catalog"],
        objectNumber: object["Name number"],
        constellation: object.Constellation,
        size: formatObjectSizeOpenNGC(object),
        notes: object.Notes,
        favorite: false,
      };
    })
    .sort((a, b) => {
      return (
        a.catalogue.localeCompare(b.catalogue) ||
        a.objectNumber - b.objectNumber
      );
    });
}

// Function to find the first object matching the search names directly from the catalog data
export function findFirstObjectByNamesListOpenNGC(
  objects: ObjectOpenNGC[],
  searchNames
) {
  // Convert the search names to lowercase for case-insensitive comparison
  const lowerCaseSearchNames = searchNames.map((name) => name.toLowerCase());

  // Iterate over the JSON data to find the first matching object
  for (let object of objects) {
    // Ensure the properties exist
    const displayName = object["Catalogue Entry"]
      ? object["Catalogue Entry"].toLowerCase()
      : "";

    // Split the alternate names string by commas, trim each name, and convert to lowercase
    const alternateNames = object["Alternative Entries"]
      ? object["Alternative Entries"]
          .split(",")
          .map((name) => name.trim().toLowerCase())
      : [];

    // Check if displayName or any of the alternateNames include any of the searchNames
    const displayNameMatch = lowerCaseSearchNames.some((searchName) =>
      displayName.startsWith(searchName)
    );
    const alternateNamesMatch = alternateNames.some((altName) =>
      lowerCaseSearchNames.some((searchName) => altName.startsWith(searchName))
    );

    // Return the object if either displayName or any of the alternateNames match any search name
    if (displayNameMatch || alternateNamesMatch) {
      return object;
    }
  }

  // Return null if no matching object is found
  return null;
}

export function getObjectByNamesListOpenNGC(
  objects: ObjectOpenNGC[],
  searchNames,
  objectFavoriteNames
) {
  let object = findFirstObjectByNamesListOpenNGC(objects, searchNames);

  if (object) {
    let displayName = formatObjectNameOpenNGC(object);
    let favorite = false;
    if (objectFavoriteNames && objectFavoriteNames.includes(displayName)) {
      favorite = true;
    }
    return {
      dec: formatOpenNGCDec(object.Declination),
      designation: object["Catalogue Entry"],
      magnitude: object.Magnitude,
      type: object.Type,
      typeCategory: object["Type Category"],
      ra: formatOpenNGCRA(object["Right Ascension"]),
      displayName: displayName,
      alternateNames: object["Alternative Entries"],
      catalogue: object["Name catalog"],
      objectNumber: object["Name number"],
      constellation: object.Constellation,
      size: formatObjectSizeOpenNGC(object),
      notes: object.Notes,
      favorite: favorite,
    };
  } else return undefined;
}

function formatOpenNGCRA(ra: string | null): string | null {
  if (ra === null) {
    return ra;
  }
  let data = convertHMSToDwarfRA(ra);
  if (data) {
    return data;
  }
  return ra;
}

function formatOpenNGCDec(dec: string | null): string | null {
  if (dec === null) {
    return dec;
  }
  let data = convertDMSToDwarfDec(dec);
  if (data) {
    return data;
  }
  return dec;
}

function formatObjectSizeOpenNGC(object: ObjectOpenNGC) {
  let sizes: string[] = [];
  if (object["Height (')"] || object["Width (')"]) {
    if (object["Height (')"]) {
      sizes.push(object["Height (')"] + "'");
    }
    if (object["Width (')"]) {
      sizes.push(object["Width (')"] + "'");
    }
  } else {
    if (object["Major Axis"]) {
      sizes.push(object["Major Axis"] + "'");
    }
    if (object["Minor Axis"]) {
      sizes.push(object["Minor Axis"] + "'");
    }
  }

  return sizes.join("x");
}

function formatObjectNameOpenNGC(object: ObjectOpenNGC) {
  let name = object["Catalogue Entry"];
  if (object["Familiar Name"]) {
    name += ` - ${object["Familiar Name"]}`;
  }
  return name;
}

export function processObjectListTelescopius(objects: ObjectTelescopius[]) {
  objects.forEach(formatObjectMosaicTelescopius);

  return objects
    .filter((object) => object["Catalogue Entry"])
    .map((object, index) => {
      let data = {
        dec: formatTelescopiusDec(object.Declination),
        designation: object["Catalogue Entry"],
        magnitude: object.Magnitude,
        type: object.Type,
        typeCategory:
          typesTypesCategories[
            object.Type as keyof typeof typesTypesCategories
          ],
        ra: formatTelescopiusRA(object["Right Ascension"]),
        displayName: formatObjectNameTelescopius(object),
        alternateNames: object["Alternative Entries"],
        constellation: object.Constellation,
        size: object.Size,
      } as AstroObject;

      let parts = object["Catalogue Entry"].split(" ");
      if (parts.length > 1) {
        data.catalogue = parts[0];
        data.objectNumber = Number(parts[1]);
      } else {
        data.catalogue = object["Catalogue Entry"];
        data.objectNumber = index;
      }
      return data;
    })
    .sort((a, b) => {
      return (
        a.catalogue.localeCompare(b.catalogue) ||
        a.objectNumber - b.objectNumber ||
        a.designation.localeCompare(b.designation)
      );
    });
}

function formatTelescopiusRA(ra: string | null): string | null {
  if (ra === null) {
    return ra;
  }
  ra = ra.replace('""', '"');
  let data = convertHMSToDwarfRA(ra);
  if (data) {
    return data;
  }
  return ra;
}

function formatTelescopiusDec(dec: string | null): string | null {
  if (dec === null) {
    return dec;
  }

  dec = dec.replace("º", "°");
  dec = dec.replace('""', '"');
  let data = convertDMSToDwarfDec(dec);
  if (data) {
    return data;
  }
  return dec;
}

function formatObjectNameTelescopius(object: ObjectTelescopius) {
  let name = object["Catalogue Entry"];
  if (object["Familiar Name"]) {
    name += ` - ${object["Familiar Name"]}`;
  }
  return name;
}

function formatObjectMosaicTelescopius(object: ObjectTelescopius) {
  let name = object["Catalogue Entry"];
  if (
    !name &&
    object["Familiar Name"] &&
    object["Familiar Name"].includes("- pane")
  ) {
    object["Catalogue Entry"] = object["Familiar Name"];
    object["Familiar Name"] = "";
    object.Type = "Mosaic";
  } else if (name && name.includes("- pane")) {
    object.Type = "Mosaic";
    if (name == object["Familiar Name"]) object["Familiar Name"] = "";
  }
}
