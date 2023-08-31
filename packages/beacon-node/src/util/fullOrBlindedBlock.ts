import {ChainForkConfig} from "@lodestar/config";
import {ssz, allForks, bellatrix, capella, deneb} from "@lodestar/types";
import {BYTES_PER_LOGS_BLOOM, ForkSeq, SYNC_COMMITTEE_SIZE, isForkExecution} from "@lodestar/params";
import {executionPayloadToPayloadHeader} from "@lodestar/state-transition";
import {ROOT_SIZE, VARIABLE_FIELD_OFFSET, getSlotFromSignedBeaconBlockSerialized} from "./sszBytes.js";

export interface TransactionsAndWithdrawals {
  transactions?: Uint8Array[];
  withdrawals?: capella.Withdrawals;
}

/**
 *  * class SignedBeaconBlock(Container):
 *   message: BeaconBlock [offset - 4 bytes]
 *   signature: BLSSignature [fixed - 96 bytes]
 */
const SIGNED_BEACON_BLOCK_COMPENSATION_LENGTH = 4 + 96;
/**
 * class BeaconBlock(Container) or class BlindedBeaconBlock(Container):
 *   slot: Slot                      [fixed - 8 bytes]
 *   proposer_index: ValidatorIndex  [fixed - 8 bytes]
 *   parent_root: Root               [fixed - 32 bytes]
 *   state_root: Root                [fixed - 32 bytes]
 *   body: MaybeBlindBeaconBlockBody [offset - 4 bytes]
 */
const BEACON_BLOCK_COMPENSATION_LENGTH = 8 + 8 + 32 + 32 + 4;
/**
 * class BeaconBlockBody(Container) or class BlindedBeaconBlockBody(Container):
 *
 * Phase 0:
 *   randaoReveal:                  [fixed -  96 bytes]
 *   eth1Data: [Container]
 *     depositRoot:                 [fixed -  32 bytes]
 *     depositCount:                [fixed -   8 bytes]
 *     blockHash:                   [fixed -  32 bytes]
 *   graffiti:                      [fixed -  32 bytes]
 *   proposerSlashings:             [offset -  4 bytes]
 *   attesterSlashings:             [offset -  4 bytes]
 *   attestations:                  [offset -  4 bytes]
 *   deposits:                      [offset -  4 bytes]
 *   voluntaryExits:                [offset -  4 bytes]
 *
 * Altair:
 *   syncCommitteeBits:             [fixed -  4 or 64 bytes] (pull from params)
 *   syncCommitteeSignature:        [fixed -  96 bytes]
 *
 * Bellatrix:
 *   executionPayload:              [offset -  4 bytes]
 *
 * Capella:
 *   blsToExecutionChanges          [offset -  4 bytes]
 *
 * Deneb:
 *   blobKzgCommitments             [offset -  4 bytes]
 */
function getOffsetWithinBeaconBlockBody(blockBytes: DataView, offset: number): number {
  const readAt = offset + SIGNED_BEACON_BLOCK_COMPENSATION_LENGTH + BEACON_BLOCK_COMPENSATION_LENGTH;
  return (
    blockBytes.getUint32(readAt, true) + SIGNED_BEACON_BLOCK_COMPENSATION_LENGTH + BEACON_BLOCK_COMPENSATION_LENGTH
  );
}

const LOCATION_OF_EXECUTION_PAYLOAD_OFFSET = 96 + 32 + 8 + 32 + 32 + 4 + 4 + 4 + 4 + 4 + SYNC_COMMITTEE_SIZE / 8 + 96;
function getExecutionPayloadOffset(blockBytes: DataView): number {
  return getOffsetWithinBeaconBlockBody(blockBytes, LOCATION_OF_EXECUTION_PAYLOAD_OFFSET);
}

const LOCATION_OF_BLS_TO_EXECUTION_CHANGE_OFFSET = LOCATION_OF_EXECUTION_PAYLOAD_OFFSET + VARIABLE_FIELD_OFFSET;
function getBlsToExecutionChangeOffset(blockBytes: DataView): number {
  return getOffsetWithinBeaconBlockBody(blockBytes, LOCATION_OF_BLS_TO_EXECUTION_CHANGE_OFFSET);
}

const LOCATION_OF_BLOB_KZG_COMMITMENTS_OFFSET = LOCATION_OF_BLS_TO_EXECUTION_CHANGE_OFFSET + VARIABLE_FIELD_OFFSET;
function getBlobKzgCommitmentsOffset(blockBytes: DataView): number {
  return getOffsetWithinBeaconBlockBody(blockBytes, LOCATION_OF_BLOB_KZG_COMMITMENTS_OFFSET);
}

const BEACON_BLOCK_BODY_COMPENSATION_LENGTH = LOCATION_OF_BLOB_KZG_COMMITMENTS_OFFSET + VARIABLE_FIELD_OFFSET;
/**
 * class ExecutionPayload(Container) or class ExecutionPayloadHeader(Container)
 *     parentHash:                  [fixed -  32 bytes]
 *     feeRecipient:                [fixed -  20 bytes]
 *     stateRoot:                   [fixed -  32 bytes]
 *     receiptsRoot:                [fixed -  32 bytes]
 *     logsBloom:                   [fixed - 256 bytes] (pull from params)
 *     prevRandao:                  [fixed -  32 bytes]
 *     blockNumber:                 [fixed -   8 bytes]
 *     gasLimit:                    [fixed -   8 bytes]
 *     gasUsed:                     [fixed -   8 bytes]
 *     timestamp:                   [fixed -   8 bytes]
 *     extraData:                   [offset -  4 bytes]
 *     baseFeePerGas:               [fixed -  32 bytes]
 *     blockHash:                   [fixed -  32 bytes]
 *     ------------------------------------------------
 *     transactions:                [offset -  4 bytes]
 *     - or -
 *     transactionsRoot:            [fixed -  32 bytes]
 *
 * Capella:
 *     withdrawals:                 [offset -  4 bytes]
 *     - or -
 *     withdrawalsRoot:             [fixed -  32 bytes]
 *     ------------------------------------------------
 * Deneb:
 *     dataGasUsed:                 [fixed -   8 bytes]
 *     excessDataGas:               [fixed -   8 bytes]
 */
function getOffsetWithinExecutionPayload(blockBytes: DataView, offset: number): number {
  const executionPayloadOffset = getExecutionPayloadOffset(blockBytes);
  const readAt = offset + executionPayloadOffset;
  return blockBytes.getUint32(readAt, true) + executionPayloadOffset;
}

const LOCATION_OF_EXTRA_DATA_OFFSET_WITHIN_EXECUTION_PAYLOAD =
  32 + 20 + 32 + 32 + BYTES_PER_LOGS_BLOOM + 32 + 8 + 8 + 8 + 8;
function getExtraDataOffset(blockBytes: DataView): number {
  return getOffsetWithinExecutionPayload(blockBytes, LOCATION_OF_EXTRA_DATA_OFFSET_WITHIN_EXECUTION_PAYLOAD);
}

const LOCATION_OF_TRANSACTIONS_OFFSET_WITHIN_EXECUTION_PAYLOAD =
  LOCATION_OF_EXTRA_DATA_OFFSET_WITHIN_EXECUTION_PAYLOAD + VARIABLE_FIELD_OFFSET + 32 + 32;

function getTransactionsOffset(blockBytes: DataView): number {
  return getOffsetWithinExecutionPayload(blockBytes, LOCATION_OF_TRANSACTIONS_OFFSET_WITHIN_EXECUTION_PAYLOAD);
}

/**
 * Bellatrix:
 *   preamble: Fixed Length Data
 *   transactionsRoot: Root
 *   extraData: Variable Length Data
 *   - to -
 *   preamble: Fixed Length Data
 *   transactions: Variable Offset
 *   extraData: Variable Length Data
 *   transactions: Variable Length Data
 *
 * Capella:
 *   preamble: Fixed Length Data
 *   transactionsRoot: Root
 *   withdrawalsRoot: Root
 *   extraData: Variable Length Data
 *   blsToExecutionChanges: Variable Length Data
 *   - to -
 *   preamble: Fixed Length Data
 *   transactions: Variable Offset
 *   withdrawals: Variable Offset // cant know this offset until have transactions
 *   extraData: Variable Length Data
 *   transactions: Variable Length Data
 *   withdrawals: Variable Length Data
 *   blsToExecutionChanges: Variable Length Data
 *
 * Deneb:
 *   preamble: Fixed Length Data
 *   transactionsRoot: Root
 *   withdrawalsRoot: Root
 *   dataGasUsed: UintBn64
 *   excessDataGas: UintBn64
 *   extraData: Variable Length Data
 *   blsToExecutionChanges: Variable Length Data
 *   blobKzgCommitments: Variable Length Data
 *   - to -
 *   preamble: Fixed Length Data
 *   transactions: Variable Offset
 *   withdrawals: Variable Offset // cant know this offset until have transactions
 *   dataGasUsed: UintBn64
 *   excessDataGas: UintBn64
 *   extraData: Variable Length Data
 *   transactions: Variable Length Data
 *   withdrawals: Variable Length Data
 *   blsToExecutionChanges: Variable Length Data
 *   blobKzgCommitments: Variable Length Data
 */

export function isSerializedBlinded(forkSeq: ForkSeq, blockBytes: Uint8Array): boolean {
  if (forkSeq < ForkSeq.bellatrix) {
    return false;
  }

  const dv = new DataView(blockBytes.buffer, blockBytes.byteOffset, blockBytes.byteLength);
  const executionPayloadOffset = getExecutionPayloadOffset(dv);
  const readAt = LOCATION_OF_EXTRA_DATA_OFFSET_WITHIN_EXECUTION_PAYLOAD + executionPayloadOffset;
  const firstByte = dv.getUint32(readAt, true) + executionPayloadOffset;
  return firstByte - readAt > 93;
}

function buildVariableOffset(value: number): Uint8Array {
  const offset = new Uint8Array(VARIABLE_FIELD_OFFSET);
  new DataView(offset.buffer).setUint32(0, value, true);
  return offset;
}

// same as isBlindedSignedBeaconBlock but without type narrowing
export function isBlinded(block: allForks.FullOrBlindedSignedBeaconBlock): boolean {
  return (block as bellatrix.SignedBlindedBeaconBlock).message.body.executionPayloadHeader !== undefined;
}

export function serializeFullOrBlindedSignedBeaconBlock(
  config: ChainForkConfig,
  value: allForks.FullOrBlindedSignedBeaconBlock
): Uint8Array {
  return isBlinded(value)
    ? config.getBlindedForkTypes(value.message.slot).SignedBeaconBlock.serialize(value)
    : config.getForkTypes(value.message.slot).SignedBeaconBlock.serialize(value);
}

export function deserializeFullOrBlindedSignedBeaconBlock(
  config: ChainForkConfig,
  bytes: Buffer | Uint8Array
): allForks.FullOrBlindedSignedBeaconBlock {
  const slot = getSlotFromSignedBeaconBlockSerialized(bytes);
  if (slot === null) {
    throw Error("getSignedBlockTypeFromBytes: invalid bytes");
  }

  return isSerializedBlinded(config.getForkSeq(slot), bytes)
    ? config.getBlindedForkTypes(slot).SignedBeaconBlock.deserialize(bytes)
    : config.getForkTypes(slot).SignedBeaconBlock.deserialize(bytes);
}

export function blindedOrFullSignedBlockToBlinded(
  config: ChainForkConfig,
  block: allForks.FullOrBlindedSignedBeaconBlock
): allForks.SignedBlindedBeaconBlock {
  if (isBlinded(block)) {
    return block;
  }

  const forkSeq = config.getForkSeq(block.message.slot);
  if (forkSeq < ForkSeq.bellatrix) {
    return block;
  }

  return {
    signature: block.signature,
    message: {
      ...block.message,
      body: {
        randaoReveal: block.message.body.randaoReveal,
        eth1Data: block.message.body.eth1Data,
        graffiti: block.message.body.graffiti,
        proposerSlashings: block.message.body.proposerSlashings,
        attesterSlashings: block.message.body.attesterSlashings,
        attestations: block.message.body.attestations,
        deposits: block.message.body.deposits,
        voluntaryExits: block.message.body.voluntaryExits,
        syncAggregate: (block.message.body as bellatrix.BeaconBlockBody).syncAggregate,
        executionPayloadHeader: executionPayloadToPayloadHeader(
          forkSeq,
          (block.message.body as bellatrix.BeaconBlockBody).executionPayload
        ),
      },
    },
  };
}

function executionPayloadHeaderToPayload(
  forkSeq: ForkSeq,
  header: allForks.ExecutionPayloadHeader,
  {transactions, withdrawals}: TransactionsAndWithdrawals
): allForks.ExecutionPayload {
  const bellatrixPayloadFields: allForks.ExecutionPayload = {
    parentHash: header.parentHash,
    feeRecipient: header.feeRecipient,
    stateRoot: header.stateRoot,
    receiptsRoot: header.receiptsRoot,
    logsBloom: header.logsBloom,
    prevRandao: header.prevRandao,
    blockNumber: header.blockNumber,
    gasLimit: header.gasLimit,
    gasUsed: header.gasUsed,
    timestamp: header.timestamp,
    extraData: header.extraData,
    baseFeePerGas: header.baseFeePerGas,
    blockHash: header.blockHash,
    transactions: transactions ?? [],
  };

  if (forkSeq >= ForkSeq.capella) {
    (bellatrixPayloadFields as capella.ExecutionPayload).withdrawals = withdrawals ?? [];
  }

  if (forkSeq >= ForkSeq.deneb) {
    // https://github.com/ethereum/consensus-specs/blob/dev/specs/eip4844/beacon-chain.md#process_execution_payload
    (bellatrixPayloadFields as deneb.ExecutionPayload).blobGasUsed = (
      header as deneb.ExecutionPayloadHeader
    ).blobGasUsed;
    (bellatrixPayloadFields as deneb.ExecutionPayload).excessBlobGas = (
      header as deneb.ExecutionPayloadHeader
    ).excessBlobGas;
  }

  return bellatrixPayloadFields;
}

export function blindedOrFullToFull(
  config: ChainForkConfig,
  forkSeq: ForkSeq,
  block: allForks.FullOrBlindedSignedBeaconBlock,
  transactionsAndWithdrawals: TransactionsAndWithdrawals
): allForks.SignedBeaconBlock {
  if (
    !isBlinded(block) || // already full
    forkSeq < ForkSeq.bellatrix || // no execution payload
    (block.message as bellatrix.BeaconBlock).body.executionPayload.timestamp === 0 // before merge
  ) {
    return block;
  }

  return config.getForkTypes(block.message.slot).SignedBeaconBlock.clone({
    signature: block.signature,
    message: {
      ...block.message,
      body: {
        ...(block.message.body as bellatrix.BeaconBlockBody),
        executionPayload: executionPayloadHeaderToPayload(
          forkSeq,
          (block.message.body as bellatrix.BlindedBeaconBlockBody).executionPayloadHeader,
          transactionsAndWithdrawals
        ),
      },
    },
  });
}

export function blindedOrFullSignedBlockToBlindedBytes(
  config: ChainForkConfig,
  block: allForks.FullOrBlindedSignedBeaconBlock,
  blockBytes: Uint8Array
): Uint8Array {
  const forkSeq = config.getForkSeq(block.message.slot);
  /**
   * Phase0:
   *   return same data
   * Altair:
   *   return same data
   */
  if (forkSeq === ForkSeq.phase0 || forkSeq === ForkSeq.altair) {
    return blockBytes;
  }

  // take apart the block to get the offsets
  const dv = new DataView(blockBytes.buffer, blockBytes.byteOffset, blockBytes.byteLength);
  const executionPayloadOffset = dv.getUint32(LOCATION_OF_EXECUTION_PAYLOAD_OFFSET, true);
  const extraDataFixedOffset = executionPayloadOffset + LOCATION_OF_EXTRA_DATA_OFFSET_WITHIN_EXECUTION_PAYLOAD;
  let extraDataVariableOffset = dv.getUint32(extraDataFixedOffset, true);
  const transactionsFixedOffset = executionPayloadOffset + LOCATION_OF_TRANSACTIONS_OFFSET_WITHIN_EXECUTION_PAYLOAD;
  const transactionsVariableOffset = dv.getUint32(transactionsFixedOffset, true);

  // data for reassembly
  const preamble = Uint8Array.prototype.slice.call(blockBytes, 0, transactionsFixedOffset);
  const preambleDataView = new DataView(preamble.buffer, preamble.byteOffset, preamble.byteLength);
  const extraData = Uint8Array.prototype.slice.call(blockBytes, extraDataVariableOffset, transactionsVariableOffset);
  const transactionsRoot = ssz.bellatrix.Transactions.hashTreeRoot(
    (block as bellatrix.SignedBeaconBlock).message.body.executionPayload.transactions
  );

  /**
   * Bellatrix:
   *   preamble: Fixed Length Data
   *   transactions: Variable Offset
   *   extraData: Variable Length Data
   *   transactions: Variable Length Data
   *   - to -
   *   preamble: Fixed Length Data
   *   transactionsRoot: Root
   *   extraData: Variable Length Data
   */
  if (forkSeq === ForkSeq.bellatrix) {
    // update variable offsets
    preambleDataView.setUint32(extraDataFixedOffset, transactionsFixedOffset + ROOT_SIZE, true);
    // build new data
    return Uint8Array.of(...preamble, ...transactionsRoot, ...extraData);
  }

  let blsToExecutionChangeVariableOffset = dv.getUint32(LOCATION_OF_BLS_TO_EXECUTION_CHANGE_OFFSET, true);
  const blsChangeAndMaybeCommitmentsData = Uint8Array.prototype.slice.call(
    blockBytes,
    blsToExecutionChangeVariableOffset
  );
  const withdrawalsRoot = ssz.capella.Withdrawals.hashTreeRoot(
    (block as capella.SignedBeaconBlock).message.body.executionPayload.withdrawals
  );

  /**
   * Capella:
   *   preamble: Fixed Length Data
   *   transactions: Variable Offset
   *   withdrawals: Variable Offset
   *   extraData: Variable Length Data
   *   transactions: Variable Length Data
   *   withdrawals: Variable Length Data
   *   blsToExecutionChanges: Variable Length Data
   *   - to -
   *   transactionsRoot: Root
   *   withdrawalsRoot: Root
   *   extraData: Variable Length Data
   *   blsToExecutionChanges: Variable Length Data
   */
  if (forkSeq === ForkSeq.capella) {
    // build variable offsets
    extraDataVariableOffset = transactionsFixedOffset + 2 * ROOT_SIZE;
    blsToExecutionChangeVariableOffset = extraDataVariableOffset + extraData.length;
    // update variable offsets
    preambleDataView.setUint32(extraDataFixedOffset, extraDataVariableOffset, true);
    preambleDataView.setUint32(LOCATION_OF_BLS_TO_EXECUTION_CHANGE_OFFSET, blsToExecutionChangeVariableOffset, true);
    // build new data
    return Uint8Array.of(
      ...preamble,
      ...transactionsRoot,
      ...withdrawalsRoot,
      ...extraData,
      ...blsChangeAndMaybeCommitmentsData
    );
  }

  // fields that are common to forks after Deneb
  const startDataGasUsed = transactionsFixedOffset + 2 * VARIABLE_FIELD_OFFSET;
  const dataGasUsedAndExcessDataGas = Uint8Array.prototype.slice.call(
    blockBytes,
    startDataGasUsed,
    startDataGasUsed + 2 * 8
  );

  let blobCommitmentsVariableOffset = dv.getUint32(LOCATION_OF_BLOB_KZG_COMMITMENTS_OFFSET, true);
  const blsToExecutionChangeLength = blobCommitmentsVariableOffset - blsToExecutionChangeVariableOffset;
  /**
   * Deneb:
   *   transactions: Variable Offset
   *   withdrawals: Variable Offset
   *   dataGasUsed: UintBn64
   *   excessDataGas: UintBn64
   *   extraData: Variable Length Data
   *   transactions: Variable Length Data
   *   withdrawals: Variable Length Data
   *   blsToExecutionChanges: Variable Length Data
   *   blobKzgCommitments: Variable Length Data
   *   - to -
   *   transactionsRoot: Root
   *   withdrawalsRoot: Root
   *   dataGasUsed: UintBn64
   *   excessDataGas: UintBn64
   *   extraData: Variable Length Data
   *   blsToExecutionChanges: Variable Length Data
   *   blobKzgCommitments: Variable Length Data
   */
  if (forkSeq === ForkSeq.deneb) {
    // build variable offsets
    extraDataVariableOffset = transactionsFixedOffset + 2 * (ROOT_SIZE + 8);
    blsToExecutionChangeVariableOffset = extraDataVariableOffset + extraData.length;
    blobCommitmentsVariableOffset = blsToExecutionChangeVariableOffset + blsToExecutionChangeLength;
    // update variable offsets
    preambleDataView.setUint32(extraDataFixedOffset, extraDataVariableOffset, true);
    preambleDataView.setUint32(LOCATION_OF_BLS_TO_EXECUTION_CHANGE_OFFSET, blsToExecutionChangeVariableOffset, true);
    preambleDataView.setUint32(LOCATION_OF_BLOB_KZG_COMMITMENTS_OFFSET, blobCommitmentsVariableOffset, true);
    // build new data
    return Uint8Array.of(
      ...preamble,
      ...transactionsRoot,
      ...withdrawalsRoot,
      ...dataGasUsedAndExcessDataGas,
      ...extraData,
      ...blsChangeAndMaybeCommitmentsData
    );
  }

  throw new Error("unknown forkSeq, cannot un-blind");
}

/**
 * Builds the full block in two chunks so that the first piece can be sent immediately
 * while the transactions and withdrawals are being fetched. All forks allow for
 * counting from the start of the executionPayload because there is no variable
 * length data before it.
 *
 * Pre-Capella, first chunk is everything up to and including the blockHash and
 * the second chunk is only the transactions.
 *
 * Post-Capella the blsToExecutionChanges offset needs to be updated so the
 * first chunk is up to and including the executionPayload offset. The second
 * chunk is from the start of the blsToExecutionChanges offset to the end of the
 * block.
 */
export async function* reassembleBlindedBlockBytesToFullBytes(
  forkSeq: ForkSeq,
  block: Uint8Array,
  transactionsAndWithdrawals: Promise<TransactionsAndWithdrawals>
): AsyncGenerator<Uint8Array> {
  /**
   * Phase0:
   *   return same data
   * Altair:
   *   return same data
   */
  if (forkSeq < ForkSeq.bellatrix) {
    return block;
  }

  // take apart the block to get the offsets
  const dv = new DataView(block.buffer, block.byteOffset, block.byteLength);
  const executionPayloadOffset = dv.getUint32(LOCATION_OF_EXECUTION_PAYLOAD_OFFSET, true);
  const locationOfExtraDataOffset = executionPayloadOffset + LOCATION_OF_EXTRA_DATA_OFFSET_WITHIN_EXECUTION_PAYLOAD;
  const extraDataOffset = dv.getUint32(locationOfExtraDataOffset, true);
  const transactionsRootOffset = executionPayloadOffset + LOCATION_OF_TRANSACTIONS_OFFSET_WITHIN_EXECUTION_PAYLOAD;

  // capella and after the blsToExecutionChanges offset changes. can send to end of executionPayload offset
  // bellatrix can go up to end of blockHash
  let lengthOfFirstChunk: number;
  if (forkSeq < ForkSeq.capella) {
    lengthOfFirstChunk = transactionsRootOffset;
  } else {
    lengthOfFirstChunk = LOCATION_OF_EXECUTION_PAYLOAD_OFFSET + VARIABLE_FIELD_OFFSET;
  }

  // slice out extra data to get length
  let extraData: Uint8Array;
  let blsToExecutionChangeOffset: number | undefined;
  if (forkSeq < ForkSeq.capella) {
    extraData = Uint8Array.prototype.slice.call(block, extraDataOffset);
  } else {
    blsToExecutionChangeOffset = dv.getUint32(LOCATION_OF_BLS_TO_EXECUTION_CHANGE_OFFSET, true);
    extraData = Uint8Array.prototype.slice.call(block, extraDataOffset, blsToExecutionChangeOffset);
  }

  // start sending data across the wire
  const firstChunk = Uint8Array.prototype.slice.call(block, 0, lengthOfFirstChunk);
  if (forkSeq === ForkSeq.bellatrix) {
    yield Uint8Array.of(
      ...firstChunk,
      ...buildVariableOffset(firstChunk.length + VARIABLE_FIELD_OFFSET + extraData.length),
      ...extraData
    );
  } else {
    yield firstChunk;
  }

  // await getting transactions and withdrawals
  // need transactions length to calculate remaining offsets
  const transactionsAndWithdrawalsData = await transactionsAndWithdrawals;
  if (!transactionsAndWithdrawalsData.transactions) {
    throw new Error("must supply transactions");
  }

  const serializedTransactions = ssz.bellatrix.Transactions.serialize(transactionsAndWithdrawalsData.transactions);
  // already calculated the offset and sent extraData. just need to send transactions
  if (forkSeq === ForkSeq.bellatrix) {
    return serializedTransactions;
  }

  // only capella blocks and after past here
  if (!transactionsAndWithdrawalsData.withdrawals) {
    throw new Error("must supply withdrawals");
  }

  let dataGasUsedAndExcessDataGas: Uint8Array | undefined;
  if (forkSeq >= ForkSeq.deneb) {
    const startDataGasUsed = transactionsRootOffset + 2 * ROOT_SIZE;
    dataGasUsedAndExcessDataGas = Uint8Array.prototype.slice.call(block, startDataGasUsed, startDataGasUsed + 2 * 8);
  }

  const executionPayloadFixedData = Uint8Array.prototype.slice.call(
    block,
    executionPayloadOffset,
    transactionsRootOffset
  );
  const executionPayload = Uint8Array.of(
    ...executionPayloadFixedData,
    ...Buffer.alloc(2 * VARIABLE_FIELD_OFFSET, 0),
    ...(dataGasUsedAndExcessDataGas ?? []),
    ...extraData,
    ...serializedTransactions,
    ...ssz.capella.Withdrawals.serialize(transactionsAndWithdrawalsData.withdrawals)
  );

  const executionPayloadFixedDataLength =
    executionPayloadOffset +
    executionPayloadFixedData.length +
    2 * VARIABLE_FIELD_OFFSET +
    (dataGasUsedAndExcessDataGas?.length ?? 0);
  const executionPayloadDv = new DataView(
    executionPayload.buffer,
    executionPayload.byteOffset,
    executionPayload.byteLength
  );
  executionPayloadDv.setUint32(
    LOCATION_OF_EXTRA_DATA_OFFSET_WITHIN_EXECUTION_PAYLOAD,
    executionPayloadFixedDataLength,
    true
  );
  executionPayloadDv.setUint32(
    LOCATION_OF_TRANSACTIONS_OFFSET_WITHIN_EXECUTION_PAYLOAD,
    executionPayloadFixedDataLength + extraData.length,
    true
  );
  executionPayloadDv.setUint32(
    LOCATION_OF_TRANSACTIONS_OFFSET_WITHIN_EXECUTION_PAYLOAD,
    executionPayloadFixedDataLength + extraData.length + serializedTransactions.length,
    true
  );

  const lastChunk = Uint8Array.prototype.slice.call(block, blsToExecutionChangeOffset);
  const newBlsToExecutionChangeOffset = executionPayloadOffset + executionPayload.length;
  let newBlobKzgCommitmentsOffset: number | undefined;
  if (forkSeq >= ForkSeq.deneb) {
    newBlobKzgCommitmentsOffset =
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      dv.getUint32(LOCATION_OF_BLOB_KZG_COMMITMENTS_OFFSET, true) - blsToExecutionChangeOffset!;
  }

  // for post-bellatrix already sent executionPayload offset. start with newBlsToExecutionChangeOffset
  return Uint8Array.of(
    ...buildVariableOffset(newBlsToExecutionChangeOffset),
    ...(newBlobKzgCommitmentsOffset !== undefined ? buildVariableOffset(newBlobKzgCommitmentsOffset) : []),
    ...executionPayload,
    ...lastChunk
  );
}
