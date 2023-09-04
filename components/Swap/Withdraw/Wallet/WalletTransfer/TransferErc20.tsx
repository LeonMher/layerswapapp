import { FC, useCallback, useEffect, useState } from "react";
import {
    useAccount,
    useContractWrite,
    usePrepareContractWrite,
    useWaitForTransaction,
    useNetwork,
    erc20ABI
} from "wagmi";
import { PublishedSwapTransactionStatus } from "../../../../../lib/layerSwapApiClient";
import { useSwapDataUpdate } from "../../../../../context/swap";
import WalletIcon from "../../../../icons/WalletIcon";
import { encodeFunctionData, createPublicClient, http, parseUnits } from 'viem'
import usdtAbi from "../../../../../lib/abis/usdt.json"
import TransactionMessage from "./transactionMessage";
import { BaseTransferButtonProps } from "./sharedTypes";
import { ButtonWrapper } from "./buttons";

type TransferERC20ButtonProps = BaseTransferButtonProps & {
    tokenContractAddress: `0x${string}`,
    tokenDecimals: number,
    asset: string,
}
const TransferErc20Button: FC<TransferERC20ButtonProps> = ({
    managedDepositAddress,
    amount,
    tokenContractAddress,
    tokenDecimals,
    savedTransactionHash,
    swapId,
    sequenceNumber,
    userDestinationAddress,
    asset
}) => {
    const [applyingTransaction, setApplyingTransaction] = useState<boolean>(!!savedTransactionHash)
    const { setSwapPublishedTx } = useSwapDataUpdate()
    const { address } = useAccount();
    const [buttonClicked, setButtonClicked] = useState(false)
    const [estimatedGas, setEstimatedGas] = useState<bigint>()

    const depositAddress = managedDepositAddress

    const contractWritePrepare = usePrepareContractWrite({
        enabled: !!depositAddress,
        address: tokenContractAddress,
        abi: asset?.toUpperCase() == 'USDT' ? usdtAbi : erc20ABI,
        functionName: 'transfer',
        gas: estimatedGas,
        args: [depositAddress, parseUnits(amount.toString(), tokenDecimals)],
    });

    let encodedData = depositAddress && contractWritePrepare?.config?.request
        && encodeFunctionData({
            ...contractWritePrepare?.config?.request,
        });

    if (address !== userDestinationAddress) {
        encodedData = encodedData ? `${encodedData}${sequenceNumber}` as `0x${string}` : null;
    }

    const tx = {
        ...contractWritePrepare?.config,
        request: {
            ...contractWritePrepare?.config?.request,
            data: encodedData
        }
    }
    const { chain } = useNetwork();

    const publicClient = createPublicClient({
        chain: chain,
        transport: http()
    })

    useEffect(() => {
        (async () => {
            if (encodedData) {

                const estimate = await publicClient.estimateGas({
                    data: encodedData,
                    account: address,
                    to: depositAddress,
                    value: parseUnits(amount.toString(), tokenDecimals)
                })

                setEstimatedGas(estimate)
            }
        })()
    }, [address, encodedData, depositAddress, amount, tokenDecimals, tx])

    const contractWrite = useContractWrite(tx)
    useEffect(() => {
        try {
            if (contractWrite?.data?.hash) {
                setSwapPublishedTx(swapId, PublishedSwapTransactionStatus.Pending, contractWrite?.data?.hash);
            }
        }
        catch (e) {
            //TODO log to logger
            console.error(e.message)
        }
    }, [contractWrite?.data?.hash, swapId])

    const clickHandler = useCallback(() => {
        setButtonClicked(true)
        contractWrite?.write && contractWrite?.write()
    }, [contractWrite])

    const waitForTransaction = useWaitForTransaction({
        hash: contractWrite?.data?.hash || savedTransactionHash,
        onSuccess: async (trxRcpt) => {
            setApplyingTransaction(true)
            setSwapPublishedTx(swapId, PublishedSwapTransactionStatus.Completed, trxRcpt.transactionHash);
            setApplyingTransaction(false)
        }
    })

    const isError = [
        contractWritePrepare,
        waitForTransaction,
        contractWrite
    ].find(d => d.isError)

    const isLoading = [
        waitForTransaction,
        contractWrite
    ].find(d => d.isLoading)

    return <>
        {
            buttonClicked &&
            <TransactionMessage
                prepare={contractWritePrepare}
                transaction={contractWrite}
                wait={waitForTransaction}
                applyingTransaction={applyingTransaction}
            />
        }
        {
            !isLoading &&
            <ButtonWrapper
                clcikHandler={clickHandler}
                disabled={contractWritePrepare?.isLoading || contractWritePrepare.status === "idle"}
                icon={<WalletIcon className="stroke-2 w-6 h-6" />}
            >
                {(isError && buttonClicked) ? <span>Try again</span>
                    : <span>Send from wallet</span>}
            </ButtonWrapper>
        }
    </>
}

export default TransferErc20Button