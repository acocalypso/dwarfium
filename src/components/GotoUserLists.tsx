import { useState, useEffect, useContext } from "react";
import type { ChangeEvent } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

import { ConnectionContext } from "@/stores/ConnectionContext";
import DSOList from "@/components/astroObjects/DSOList";
import ImportObjectListModal from "@/components/ImportObservationListModal";
import DeleteObjectListModal from "./DeleteObservationListModal";
import { AstroObject } from "@/types";
import {
  fetchObjectListsDb,
  fetchObjectListsNamesDb,
  fetchObjectListByNameDb,
  saveUserCurrentObjectListNameDb,
} from "@/db/db_utils";

type PropType = {
  objectFavoriteNames: string[];
  setObjectFavoriteNames: Dispatch<SetStateAction<string[]>>;
  objectPersonalList: AstroObject[];
  setObjectPersonalList: Dispatch<SetStateAction<AstroObject[]>>;
  setModule: Dispatch<SetStateAction<string | undefined>>;
  setErrors: Dispatch<SetStateAction<string | undefined>>;
  setSuccess: Dispatch<SetStateAction<string | undefined>>;
};

export default function GotoUserLists(props: PropType) {
  const { objectFavoriteNames, setObjectFavoriteNames } = props;
  const { objectPersonalList, setObjectPersonalList } = props;
  const { setModule, setErrors, setSuccess } = props;

  let connectionCtx = useContext(ConnectionContext);

  let [objectListsNames, setObjectListsNames] = useState<string[]>([]);
  let [objectLists, setObjectLists] = useState<{
    [k: string]: AstroObject[];
  }>({});
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectPersonalList, setSelectPersonalList] = useState(
    connectionCtx.currentUserObjectListName === "personal",
  );

  useEffect(() => {
    try {
      // get objects lists from local storage on page load
      console.log("Load personalObjecList on load");
      let personalObjecList = fetchObjectListByNameDb("personal");
      if (personalObjecList) {
        setObjectPersonalList(personalObjecList);
        console.log(
          "Loaded  personalObjecList on load: ",
          personalObjecList.length,
        );
      } else {
        console.log("No personalObjecList found in DB");
      }
    } catch (error) {
      console.error("Error personalObjecList on load", error);
    }
  }, []);

  useEffect(() => {
    // get objects lists from local storage personal list change
    let names = fetchObjectListsNamesDb();
    if (names) {
      setObjectListsNames(names);
    }
    let lists = fetchObjectListsDb();
    console.log("List Objects", lists);
    if (lists) {
      setObjectLists(lists);
    }
  }, [objectPersonalList]);

  function selectListHandler(e: ChangeEvent<HTMLSelectElement>) {
    let listName = e.target.value;
    setSelectPersonalList(listName == "personal");
    connectionCtx.setUserCurrentObjectListName(listName);
    saveUserCurrentObjectListNameDb(listName);
  }

  let showInstructions =
    objectListsNames.length === 0 ||
    connectionCtx.currentUserObjectListName === "default";

  function importListModalHandle() {
    setShowImportModal(true);
  }

  function deleteListModalHandle() {
    setShowDeleteModal(true);
  }

  const { t } = useTranslation();
  // eslint-disable-next-line no-unused-vars
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en");

  useEffect(() => {
    const storedLanguage = localStorage.getItem("language");
    if (storedLanguage) {
      setSelectedLanguage(storedLanguage);
      i18n.changeLanguage(storedLanguage);
    }
  }, []);

  return (
    <div>
      <div className="container">
        {!connectionCtx.connectionStatusStellarium && (
          <p className="text-danger">{t("cGoToListConnectStellarium")}.</p>
        )}
        {!connectionCtx.connectionStatus && (
          <p className="text-danger">
            {t("cGoToListConnectDwarf", {
              DwarfType: connectionCtx.typeNameDwarf,
            })}
          </p>
        )}

        <div className="row">
          <div className="col-xl-6 col-lg-5 col-md-5 col-12">
            <select
              className="form-select mb-2"
              value={connectionCtx.currentUserObjectListName || "default"}
              onChange={selectListHandler}
            >
              <option value="default">{t("cGoToListdefault")}</option>
              <option value="personal">{t("cGoToListpersonal")}</option>
              {objectListsNames.map((list, index) => (
                <option key={index} value={list}>
                  {list}
                </option>
              ))}
            </select>
          </div>

          <div className="col-lg-5 col-md-6 col-sm-6 col-10">
            <button
              className="btn btn-more02 me-2 mb-2"
              onClick={importListModalHandle}
            >
              {t("cGoToUserListNewList")}
            </button>
            {!selectPersonalList && (
              <button
                className="btn btn-more03 me-2 mb-2"
                onClick={deleteListModalHandle}
              >
                {t("cGoToUserListDeleteList")}
              </button>
            )}
          </div>
        </div>

        {connectionCtx.currentUserObjectListName &&
          objectLists[connectionCtx.currentUserObjectListName] && (
            <DSOList
              objects={objectLists[connectionCtx.currentUserObjectListName]}
              objectFavoriteNames={objectFavoriteNames}
              setObjectFavoriteNames={setObjectFavoriteNames}
              objectPersonalList={objectPersonalList}
              setObjectPersonalList={setObjectPersonalList}
              isInObjectPersonalList={selectPersonalList}
              setModule={setModule}
              setErrors={setErrors}
              setSuccess={setSuccess}
            ></DSOList>
          )}

        {showInstructions && (
          <>
            <p
              className="mt-4"
              dangerouslySetInnerHTML={{
                __html: t("cGoToUserListCustomObjectsListInstruction1"),
              }}
            />

            <p>{t("cGoToUserListCustomObjectsListInstruction2")}</p>
            <p>{t("cGoToUserListCustomObjectsListInstruction3")}</p>
            {""}
            <br />
            <br />
            <br />
            <br />
            <br />
            <br />
            <br />
            <br />
            <br />
          </>
        )}
        <ImportObjectListModal
          showModal={showImportModal}
          setShowModal={setShowImportModal}
          objectListsNames={objectListsNames}
          setObjectListsNames={setObjectListsNames}
          objectLists={objectLists}
          setObjectLists={setObjectLists}
        />
        <DeleteObjectListModal
          showModal={showDeleteModal}
          setShowModal={setShowDeleteModal}
          objectListsNames={objectListsNames}
          setObjectListsNames={setObjectListsNames}
          objectLists={objectLists}
          setObjectLists={setObjectLists}
        />
      </div>
    </div>
  );
}
