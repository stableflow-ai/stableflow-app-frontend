import useBridgeStore from "@/all-tokens/bridge-store";
import clsx from "clsx";
import { useMemo, useState } from "react";
import EditButton from "./edit-button";
import DestinationAddress from "./destination-address";

const Destination = (props: any) => {
  const { isTo, addressValidation, token } = props;

  const bridgeStore = useBridgeStore();

  const [edit, setEdit] = useState(false);

  const {
    recipientAddress,
  } = bridgeStore;

  const isEditValid = useMemo(() => {
    if (!isTo || edit) {
      return false;
    }
    if (recipientAddress && !!addressValidation) {
      return false;
    }
    return true;
  }, [addressValidation, token, recipientAddress, isTo, edit]);

  return (
    <div
      className={clsx(
        "flex justify-start items-center gap-[8px] flex-1",
      )}
    >
      {
        edit
          ? (
            <input
              type="text"
              className="text-xs font-medium text-[#444C59] outline-none px-[5px] md:px-[14px] flex-1 w-0 md:w-[unset]"
              placeholder="Paste here"
              autoFocus
              value={recipientAddress}
              onChange={(e) => {
                bridgeStore.set({ recipientAddress: e.target.value });
              }}
              onBlur={() => {
                setEdit(false);
              }}
            />
          )
          : (
            (recipientAddress && !!addressValidation)
              ? (
                <DestinationAddress
                  isError={!addressValidation.isValid}
                  address={recipientAddress}
                  onClick={() => {
                    bridgeStore.set({ recipientAddress: "" });
                    setEdit(true);
                  }}
                />
              )
              : null
          )
      }
      {isTo &&
        (edit ? (
          <button
            className="button text-[#444C59] text-[12px] underline duration-300"
            onClick={() => {
              setEdit(false);
              bridgeStore.set({ recipientAddress: "" });
            }}
          >
            Cancel
          </button>
        ) : (
          isEditValid && (
            <EditButton
              onClick={() => setEdit(true)}
              token={token}
            />
          )
        ))}
    </div>
  );
};

export default Destination;
