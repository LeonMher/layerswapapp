import { FC } from "react"
import { ApiResponse } from "../../../../Models/ApiResponse"
import { useSettingsState } from "../../../../context/settings"
import { useSwapDataState } from "../../../../context/swap"
import KnownInternalNames from "../../../../lib/knownIds"
import LayerSwapApiClient, { DepositAddress, DepositType, Fee } from "../../../../lib/layerSwapApiClient"
import ImtblxWalletWithdrawStep from "./ImtblxWalletWithdrawStep"
import StarknetWalletWithdrawStep from "./StarknetWalletWithdraw"
import useSWR from 'swr'
import TransferFromWallet from "./WalletTransfer"
import { CanDoSweeplessTransfer } from "../../../../lib/fees"
import useWallet from "../../../../hooks/useWallet"
import { Layer } from "../../../../Models/Layer"

const WalletTransfer: FC = () => {
    const { swap } = useSwapDataState()
    const { layers } = useSettingsState()
    const { wallets } = useWallet();
    const wallet = wallets?.find(w => w?.network?.internal_name === swap?.source_network)

    const { source_network: source_network_internal_name, destination_address, destination_network, destination_network_asset, source_network_asset } = swap || {}
    const source_network = layers.find(n => n.internal_name === source_network_internal_name) as (Layer & { isExchange: false })
    const destination = layers.find(n => n.internal_name === destination_network)
    const sourceAsset = source_network?.assets?.find(c => c.asset.toLowerCase() === swap?.source_network_asset.toLowerCase())

    const sourceIsImmutableX = swap?.source_network?.toUpperCase() === KnownInternalNames.Networks.ImmutableXMainnet?.toUpperCase() || swap?.source_network === KnownInternalNames.Networks.ImmutableXGoerli?.toUpperCase()
    const sourceIsStarknet = swap?.source_network?.toUpperCase() === KnownInternalNames.Networks.StarkNetMainnet?.toUpperCase() || swap?.source_network === KnownInternalNames.Networks.StarkNetGoerli?.toUpperCase()
    const canDoSweeplessTransfer = source_network && CanDoSweeplessTransfer(source_network, wallet?.address, destination_address)
    
    const layerswapApiClient = new LayerSwapApiClient()
    const shouldGetGeneratedAddress = !canDoSweeplessTransfer
    const generateDepositParams = shouldGetGeneratedAddress ? [source_network_internal_name] : null
    const {
        data: generatedDeposit
    } = useSWR<ApiResponse<DepositAddress>>(generateDepositParams, ([network]) => layerswapApiClient.GenerateDepositAddress(network), { dedupingInterval: 60000 })

    const managedDepositAddress = sourceAsset?.network?.managed_accounts?.[0]?.address;
    const generatedDepositAddress = generatedDeposit?.data?.address

    const depositAddress = canDoSweeplessTransfer ? managedDepositAddress : generatedDepositAddress

    const sourceChainId = (source_network && source_network.isExchange === false) ? Number(source_network?.chain_id) : null
    const feeParams = {
        source: source_network_internal_name,
        destination: destination?.internal_name,
        source_asset: source_network_asset,
        destination_asset: destination_network_asset,
        refuel: swap?.has_refuel
    }

    const { data: feeData } = useSWR<ApiResponse<Fee[]>>([feeParams], ([params]) => layerswapApiClient.GetFee(params), { dedupingInterval: 60000 })
    const walletTransferFee = feeData?.data?.find(f => f?.deposit_type === DepositType.Wallet)
    const requested_amount = Number(walletTransferFee?.min_amount) > Number(swap?.requested_amount) ? walletTransferFee?.min_amount : swap?.requested_amount

    if (sourceIsImmutableX)
        return <Wrapper>
            {depositAddress && <ImtblxWalletWithdrawStep depositAddress={depositAddress} />}
        </Wrapper>
    else if (sourceIsStarknet)
        return <Wrapper>
            {requested_amount && depositAddress && <StarknetWalletWithdrawStep amount={requested_amount} depositAddress={depositAddress} />}
        </Wrapper>
    return <Wrapper>
        {swap && source_network && sourceAsset && requested_amount && <TransferFromWallet
            sequenceNumber={swap.sequence_number}
            swapId={swap.id}
            networkDisplayName={source_network?.display_name}
            tokenDecimals={sourceAsset?.decimals}
            tokenContractAddress={sourceAsset?.contract_address as `0x${string}`}
            chainId={sourceChainId as number}
            depositAddress={depositAddress as `0x${string}`}
            userDestinationAddress={swap.destination_address as `0x${string}`}
            amount={requested_amount}
            asset={sourceAsset?.asset}
        />}
    </Wrapper>

}

const Wrapper: FC<{ children?: React.ReactNode }> = ({ children }) => {
    return <div className='border-secondary-500 rounded-md border bg-secondary-700 p-3'>
        {children}
    </div>
}

export default WalletTransfer
