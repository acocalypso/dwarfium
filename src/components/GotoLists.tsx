import { useContext, useEffect, useState } from "react";
import type { ChangeEvent } from "react";

import DSOList from "@/components/astroObjects/DSOList";
import PlanetsList from "@/components/astroObjects/PlanetsList";
import dsoCatalog from "../../data/catalogs/dso_catalog.json";
import { processObjectListOpenNGC } from "@/lib/observation_lists_utils";
import { ConnectionContext } from "@/stores/ConnectionContext";
import { saveCurrentObjectListNameDb } from "@/db/db_utils";
import { fetchObjectFavoriteNamesDb } from "@/db/db_utils";

let dsoObject = processObjectListOpenNGC(dsoCatalog);
console.info("DSO processObjectListOpenNGC");

export default function AutoGoto() {
  let connectionCtx = useContext(ConnectionContext);
  let [objectFavoriteNames, setObjectFavoriteNames] = useState<string[]>([]);

  useEffect(() => {
    // get objects lists from local storage on page load
    let favoriteNames = fetchObjectFavoriteNamesDb();
    if (favoriteNames) {
      setObjectFavoriteNames(favoriteNames);
    }
  }, []);

  function selectListHandler(e: ChangeEvent<HTMLSelectElement>) {
    connectionCtx.setCurrentObjectListName(e.target.value);
    saveCurrentObjectListNameDb(e.target.value);
  }

  let showInstructions =
    connectionCtx.currentObjectListName === "default" ||
    connectionCtx.currentObjectListName === undefined;

  return (
    <div>
      <div className="container">
        {!connectionCtx.connectionStatusStellarium && (
          <p className="text-danger">
            You must connect to Stellarium for Center to work.
          </p>
        )}
        {!connectionCtx.connectionStatus && (
          <p className="text-danger">
            You must connect to Dwarf II for Goto to work.
          </p>
        )}

        <select
          className="form-select-dso"
          value={connectionCtx.currentObjectListName || "default"}
          onChange={selectListHandler}
        >
          <option value="default">Select object lists</option>
          <option value="dso">DSO</option>
          <option value="planets">Planets, Moon and Sun</option>
        </select>
        {showInstructions && (
          <>
            <p className="mt-4">Please select an objects list.</p>

            <ol>
              <li>
                The DSO list has objects that are:
                <ul>
                  <li>
                    Large (&gt; 15 arcminutes) and relatively bright (under 10
                    magnitude). 119 objects.
                  </li>
                  <li>
                    Large (&gt; 15 arcminutes) and unknown brightness. 84
                    objects.
                  </li>
                  <li>
                    Small (&lt; 15 arcminutes), relatively bright (under 10
                    magnitude), with common names. 234 objects.
                  </li>
                  <li>
                    118 of the brightest stars with common names, with at least
                    one per constellation.
                  </li>
                </ul>
              </li>
              <li>
                The Planets, Moon and Sun list has the planets in our solar
                system with the Moon and The Sun. Be aware, Dwarf II is not good
                for taking images of the planets.
              </li>
            </ol>
            <p>
              &quot;Center&quot; will show the selected object in Stellarium.
              &quot;Goto&quot; will move Dwarf II to the selected object.
            </p>
            {""}
            <br />
            <br />
            <br />
            <br />
            <br />
            <br />
          </>
        )}
        {connectionCtx.currentObjectListName === "dso" && (
          <DSOList
            objects={dsoObject}
            objectFavoriteNames={objectFavoriteNames}
            setObjectFavoriteNames={setObjectFavoriteNames}
          ></DSOList>
        )}
        {connectionCtx.currentObjectListName === "planets" && (
          <PlanetsList></PlanetsList>
        )}
      </div>
    </div>
  );
}
