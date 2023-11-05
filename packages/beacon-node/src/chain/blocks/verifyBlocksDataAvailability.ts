import {chain} from "lodash";
import {computeStartSlotAtEpoch, computeTimeAtSlot, DataAvailableStatus} from "@lodestar/state-transition";
import {ChainForkConfig} from "@lodestar/config";
import {IForkChoice, ProtoBlock} from "@lodestar/fork-choice";
import {Slot, deneb, UintNum64} from "@lodestar/types";
import {toHexString} from "@lodestar/utils";
import {IClock} from "../../util/clock.js";
import {BlockError, BlockErrorCode} from "../errors/index.js";
import {validateBlobSidecars} from "../validation/blobSidecar.js";
import {BlockInput, BlockInputType, ImportBlockOpts, BlobSidecarValidation} from "./types.js";

const BLOB_AVAILABILITY_TIMEOUT = 3_000;

/**
 * Verifies some early cheap sanity checks on the block before running the full state transition.
 *
 * - Parent is known to the fork-choice
 * - Check skipped slots limit
 * - check_block_relevancy()
 *   - Block not in the future
 *   - Not genesis block
 *   - Block's slot is < Infinity
 *   - Not finalized slot
 *   - Not already known
 */
export async function verifyBlocksDataAvailability(
    chain: {config: ChainForkConfig; genesisTime: UintNum64},
    blocks: BlockInput[],
    opts: ImportBlockOpts
): Promise<DataAvailableStatus[]> {
  if (blocks.length === 0) {
    throw Error("Empty partiallyVerifiedBlocks");
  }

  const dataAvailabilityStatuses: DataAvailableStatus[] = [];

  for (const blockInput of blocks) {

    // Validate status of only not yet finalized blocks, we don't need yet to propogate the status
    // as it is not used upstream anywhere
    const dataAvailabilityStatus = await maybeValidateBlobs(chain, blockInput, opts);
    dataAvailabilityStatuses.push(dataAvailabilityStatus);
  }


  return dataAvailabilityStatuses;
}

async function maybeValidateBlobs(
  chain: {config: ChainForkConfig; genesisTime: UintNum64},
  blockInput: BlockInput,
  opts: ImportBlockOpts
): Promise<DataAvailableStatus> {
  switch (blockInput.type) {
    case BlockInputType.blobsPromise:
    case BlockInputType.postDeneb: {
      if (opts.validBlobSidecars === BlobSidecarValidation.Full) {
        return DataAvailableStatus.available;
      }

      // run full validation
      const {block} = blockInput;
      const blockSlot = block.message.slot;

      const blobs =
        blockInput.type === BlockInputType.postDeneb
          ? blockInput.blobs
          : (await raceWithCutoff(chain, blockInput, blockInput.availabilityPromise)).blobs;

      const {blobKzgCommitments} = (block as deneb.SignedBeaconBlock).message.body;
      const beaconBlockRoot = chain.config.getForkTypes(blockSlot).BeaconBlock.hashTreeRoot(block.message);

      // if the blob siddecars have been individually verified then we can skip kzg proof check
      // but other checks to match blobs with block data still need to be performed
      const skipProofsCheck = opts.validBlobSidecars === BlobSidecarValidation.Individual;
      validateBlobSidecars(blockSlot, beaconBlockRoot, blobKzgCommitments, blobs, {skipProofsCheck});

      return DataAvailableStatus.available;
    }

    case BlockInputType.preDeneb:
      return DataAvailableStatus.preDeneb;
  }
}

async function raceWithCutoff<T>(
  chain: {config: ChainForkConfig; genesisTime: UintNum64},
  blockInput: BlockInput,
  availabilityPromise: Promise<T>
): Promise<T> {
  const {block} = blockInput;
  const blockSlot = block.message.slot;

  const cutoffTime =
    computeTimeAtSlot(chain.config, blockSlot, chain.genesisTime) * 1000 + BLOB_AVAILABILITY_TIMEOUT - Date.now();
  const cutoffTimeout =
    cutoffTime < 0
      ? Promise.reject()
      : new Promise((_resolve, reject) => setTimeout(reject, cutoffTime));
  const startTime = Date.now()
  console.log("racing",{cutoffTime})
  try{
    await Promise.race([availabilityPromise,cutoffTimeout]);
  }catch(e){
    throw new BlockError(block,{code:BlockErrorCode.DATA_UNAVAILABLE})
  }
  const availabilityTime = Date.now() - startTime;
  console.log("available",{availabilityTime,cutoffTimeout})
  // we can only be here if availabilityPromise has resolved else an error will be thrown
  return availabilityPromise;
}
