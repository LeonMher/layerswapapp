import { Formik, FormikProps } from "formik";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSettingsState } from "../../../context/settings";
import { SwapFormValues } from "../../DTOs/SwapFormValues";
import { useSwapDataState, useSwapDataUpdate } from "../../../context/swap";
import React from "react";
import ConnectNetwork from "../../ConnectNetwork";
import toast from "react-hot-toast";
import MainStepValidation from "../../../lib/mainStepValidator";
import { generateSwapInitialValues, generateSwapInitialValuesFromSwap } from "../../../lib/generateSwapInitialValues";
import LayerSwapApiClient, { SwapItem, TransactionType } from "../../../lib/layerSwapApiClient";
import Modal from "../../modal/modal";
import SwapForm from "./Form";
import { useRouter } from "next/router";
import useSWR from "swr";
import { ApiResponse } from "../../../Models/ApiResponse";
import { Partner } from "../../../Models/Partner";
import { UserType, useAuthDataUpdate } from "../../../context/authContext";
import { ApiError, KnownErrorCode } from "../../../Models/ApiError";
import { resolvePersistantQueryParams } from "../../../helpers/querryHelper";
import { useQueryState } from "../../../context/query";
import { SwapStatus } from "../../../Models/SwapStatus";
import SwapDetails from "..";
import TokenService from "../../../lib/TokenService";
import LayerSwapAuthApiClient from "../../../lib/userAuthApiClient";
import StatusIcon from "../../SwapHistory/StatusIcons";
import Image from 'next/image';
import { ArrowRight, X } from "lucide-react";
import IconButton from "../../buttons/iconButton";
import { AnimatePresence, motion } from "framer-motion";
import useWindowDimensions from "../../../hooks/useWindowDimensions";

type NetworkToConnect = {
    DisplayName: string;
    AppURL: string;
}

export default function Form() {
    const { isMobile } = useWindowDimensions()
    const formikRef = useRef<FormikProps<SwapFormValues>>(null);
    const [showConnectNetworkModal, setShowConnectNetworkModal] = useState(false);
    const [showSwapModal, setShowSwapModal] = useState(false);
    const [networkToConnect, setNetworkToConnect] = useState<NetworkToConnect>();
    const router = useRouter();
    const { updateAuthData, setUserType } = useAuthDataUpdate()

    const settings = useSettingsState();
    const query = useQueryState()
    const { createSwap, setSwapId } = useSwapDataUpdate()

    const layerswapApiClient = new LayerSwapApiClient()
    const { data: partnerData } = useSWR<ApiResponse<Partner>>(query?.addressSource && `/apps?name=${query?.addressSource}`, layerswapApiClient.fetcher)
    const partner = query?.addressSource && partnerData?.data?.name?.toLowerCase() === (query?.addressSource as string)?.toLowerCase() ? partnerData?.data : undefined

    const { swap } = useSwapDataState()

    useEffect(() => {
        if (swap) {
            const initialValues = generateSwapInitialValuesFromSwap(swap, settings)
            formikRef?.current?.resetForm({ values: initialValues })
            formikRef?.current?.validateForm(initialValues)
        }
    }, [swap])

    const handleSubmit = useCallback(async (values: SwapFormValues) => {
        try {
            const accessToken = TokenService.getAuthData()?.access_token
            if (!accessToken) {
                try {
                    var apiClient = new LayerSwapAuthApiClient();
                    const res = await apiClient.guestConnectAsync()
                    updateAuthData(res)
                    setUserType(UserType.GuestUser)
                }
                catch (error) {
                    toast.error(error.response?.data?.error || error.message)
                    return;
                }
            }
            const swapId = await createSwap(values, query, partner);
            if (swapId) {
                setSwapId(swapId)
                var swapURL = window.location.protocol + "//"
                    + window.location.host + `/swap/${swapId}`;
                const params = resolvePersistantQueryParams(router.query)
                if (params) {
                    const search = new URLSearchParams(params as any);
                    swapURL += `?${search}`
                }
                window.history.pushState({ path: swapURL }, '', swapURL);
            }
            setShowSwapModal(true)
        }
        catch (error) {
            const data: ApiError = error?.response?.data?.error
            if (data?.code === KnownErrorCode.BLACKLISTED_ADDRESS) {
                toast.error("You can't transfer to that address. Please double check.")
            }
            else if (data?.code === KnownErrorCode.INVALID_ADDRESS_ERROR) {
                toast.error(`Enter a valid ${values.to?.display_name} address`)
            }
            else if (data?.code === KnownErrorCode.UNACTIVATED_ADDRESS_ERROR && values.to) {
                setNetworkToConnect({
                    DisplayName: values.to?.display_name,
                    AppURL: data.message
                })
                setShowConnectNetworkModal(true);
            }
            else {
                toast.error(error.message)
            }
        }
    }, [createSwap, query, partner, router, updateAuthData, setUserType, swap])

    const destAddress: string = query?.destAddress as string;

    const isPartnerAddress = partner && destAddress;

    const isPartnerWallet = isPartnerAddress && partner?.is_wallet;

    const initialValues: SwapFormValues = swap ? generateSwapInitialValuesFromSwap(swap, settings)
        : generateSwapInitialValues(settings, query)

    return <>
        <div className="drop-shadow-xl cursor-pointer rounded-r-lg absolute z-10 mt-3 border-l-0">
            <AnimatePresence exitBeforeEnter>
                {swap && !showSwapModal &&
                    <PendingSwap onClick={() => setShowSwapModal(true)} />
                }
            </AnimatePresence >
        </div>
        <Modal height="fit" show={showConnectNetworkModal} setShow={setShowConnectNetworkModal} header={`${networkToConnect?.DisplayName} connect`}>
            {networkToConnect && <ConnectNetwork NetworkDisplayName={networkToConnect?.DisplayName} AppURL={networkToConnect?.AppURL} />}
        </Modal>
        <Modal height='90%' show={showSwapModal} setShow={setShowSwapModal} header={`Complete the swap`}>
            <SwapDetails type="contained" />
        </Modal>
        <Formik
            innerRef={formikRef}
            initialValues={initialValues}
            validateOnMount={true}
            validate={MainStepValidation({ settings, query })}
            onSubmit={handleSubmit}
        >
            <SwapForm isPartnerWallet={!!isPartnerWallet} partner={partner} />
        </Formik>
    </>
}
const textMotion = {
    rest: {
        color: "grey",
        x: 0,
        transition: {
            duration: 0.4,
            type: "tween",
            ease: "easeIn"
        }
    },
    hover: {
        color: "blue",
        x: 30,
        transition: {
            duration: 0.4,
            type: "tween",
            ease: "easeOut"
        }
    }
};

const slashMotion = {
    rest: { opacity: 0, ease: "easeOut", duration: 0.2, type: "tween" },
    hover: {
        opacity: 1,
        transition: {
            duration: 0.4,
            type: "tween",
            ease: "easeIn"
        }
    }
};

const PendingSwap = ({ onClick }: { onClick: () => void }) => {
    const { swap } = useSwapDataState()
    const { source_exchange: source_exchange_internal_name,
        destination_network: destination_network_internal_name,
        source_network: source_network_internal_name,
        destination_exchange: destination_exchange_internal_name,
        source_network_asset,
        requested_amount
    } = swap || {}
    const settings = useSettingsState()

    if (!swap)
        return <></>

    const { exchanges, networks, currencies, resolveImgSrc } = settings

    const source = source_exchange_internal_name ? exchanges.find(e => e.internal_name === source_exchange_internal_name) : networks.find(e => e.internal_name === source_network_internal_name)
    const source_currency = currencies?.find(c => c.asset === source_network_asset)
    const destination_exchange = destination_exchange_internal_name && exchanges.find(e => e.internal_name === destination_exchange_internal_name)
    const destination = destination_exchange_internal_name ? destination_exchange : networks.find(n => n.internal_name === destination_network_internal_name)
    const output_transaction = swap.transactions.find(t => t.type === TransactionType.Output)

    return <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -10, opacity: 0 }}
        transition={{ duration: 0.2 }}
    >
        <motion.div
            onClick={onClick}
            initial="rest" whileHover="hover" animate="rest"
            className="relative bg-secondary-600">
            {/* <motion.div
                variants={slashMotion}
                className="absolute left-0 flex opacity-0 bg-secondary-600"
            >
                <div className="rounded-lg p-2">
                    <X className="w-4 h-4" />
                </div>
            </motion.div> */}
            <motion.div
                variants={textMotion}
                className="flex items-center bg-secondary-600">
                <div className="text-primary-text flex px-4 p-2 items-center space-x-2">
                    <span className="flex items-center">
                        {swap && <StatusIcon swap={swap} short={true} />}
                    </span>
                    <div className="flex-shrink-0 h-5 w-5 relative">
                        {source &&
                            <Image
                                src={resolveImgSrc(source)}
                                alt="From Logo"
                                height="60"
                                width="60"
                                className="rounded-md object-contain"
                            />
                        }
                    </div>
                    <ArrowRight className="h-4 w-4 mx-2" />
                    <div className="flex-shrink-0 h-5 w-5 relative block">
                        {destination &&
                            <Image
                                src={resolveImgSrc(destination)}
                                alt="To Logo"
                                height="60"
                                width="60"
                                className="rounded-md object-contain"
                            />
                        }
                    </div>
                </div>
            </motion.div>
        </motion.div>
    </motion.div>
}

export const shoudlCreateNewSwap = (swap: SwapItem | undefined, formValues: SwapFormValues) => {

    const swapInputTransaction = swap?.transactions?.find(t => t.type === TransactionType.Input) ? swap?.transactions?.find(t => t.type === TransactionType.Input) : JSON.parse(localStorage.getItem("swapTransactions") || "{ }")?.[swap?.id || '']
    console.log("swapInputTransaction", swapInputTransaction)
    return !(swap &&
        !(swap.status !== SwapStatus.UserTransferPending
            || swapInputTransaction)
        && [swap.source_exchange, swap.source_network].includes(formValues.from?.internal_name)
        && [swap.destination_exchange, swap.destination_network].includes(formValues.to?.internal_name)
        && swap.source_network_asset === formValues.currency?.asset
        && swap.requested_amount === Number(formValues.amount)
        && swap.destination_address === formValues.destination_address)
}