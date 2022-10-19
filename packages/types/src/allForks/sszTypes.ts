import {ForkName} from "@lodestar/params";
import {ssz as phase0} from "../phase0/index.js";
import {ssz as altair} from "../altair/index.js";
import {ssz as bellatrix} from "../bellatrix/index.js";
import {ssz as capella} from "../capella/index.js";

/**
 * Index the ssz types that differ by fork
 * A record of AllForksSSZTypes indexed by fork
 */
export const allForks = {
  [ForkName.phase0]: {
    BeaconBlockBody: phase0.BeaconBlockBody,
    BeaconBlock: phase0.BeaconBlock,
    SignedBeaconBlock: phase0.SignedBeaconBlock,
    BeaconState: phase0.BeaconState,
    Metadata: phase0.Metadata,
  },
  [ForkName.altair]: {
    BeaconBlockBody: altair.BeaconBlockBody,
    BeaconBlock: altair.BeaconBlock,
    SignedBeaconBlock: altair.SignedBeaconBlock,
    BeaconState: altair.BeaconState,
    Metadata: altair.Metadata,
  },
  [ForkName.bellatrix]: {
    BeaconBlockBody: bellatrix.BeaconBlockBody,
    BeaconBlock: bellatrix.BeaconBlock,
    SignedBeaconBlock: bellatrix.SignedBeaconBlock,
    BeaconState: bellatrix.BeaconState,
    BlindedBeaconBlockBody: bellatrix.BlindedBeaconBlockBody,
    BlindedBeaconBlock: bellatrix.BlindedBeaconBlock,
    SignedBlindedBeaconBlock: bellatrix.SignedBlindedBeaconBlock,
    ExecutionPayload: bellatrix.ExecutionPayload,
    ExecutionPayloadHeader: bellatrix.ExecutionPayloadHeader,
    Metadata: altair.Metadata,
  },
  [ForkName.capella]: {
    BeaconBlockBody: capella.BeaconBlockBody,
    BeaconBlock: capella.BeaconBlock,
    SignedBeaconBlock: capella.SignedBeaconBlock,
    BeaconState: capella.BeaconState,
    BlindedBeaconBlockBody: capella.BlindedBeaconBlockBody,
    BlindedBeaconBlock: capella.BlindedBeaconBlock,
    SignedBlindedBeaconBlock: capella.SignedBlindedBeaconBlock,
    ExecutionPayload: capella.ExecutionPayload,
    ExecutionPayloadHeader: capella.ExecutionPayloadHeader,
    Metadata: altair.Metadata,
  },
};

/**
 * Index the execution ssz types that differ by fork
 * A record of AllForksExecutionSSZTypes indexed by fork
 */
export const allForksExecution = {
  bellatrix: {
    BeaconBlockBody: bellatrix.BeaconBlockBody,
    BeaconBlock: bellatrix.BeaconBlock,
    SignedBeaconBlock: bellatrix.SignedBeaconBlock,
    BeaconState: bellatrix.BeaconState,
    ExecutionPayload: bellatrix.ExecutionPayload,
    ExecutionPayloadHeader: bellatrix.ExecutionPayloadHeader,
  },
  capella: {
    BeaconBlockBody: capella.BeaconBlockBody,
    BeaconBlock: capella.BeaconBlock,
    SignedBeaconBlock: capella.SignedBeaconBlock,
    BeaconState: capella.BeaconState,
    // Not used in phase0 but added for type consitency
    ExecutionPayload: capella.ExecutionPayload,
    ExecutionPayloadHeader: capella.ExecutionPayloadHeader,
  },
};

/**
 * Index the blinded ssz types that differ by fork
 * A record of AllForksBlindedSSZTypes indexed by fork
 */
export const allForksBlinded = {
  bellatrix: {
    BeaconBlockBody: bellatrix.BlindedBeaconBlockBody,
    BeaconBlock: bellatrix.BlindedBeaconBlock,
    SignedBeaconBlock: bellatrix.SignedBlindedBeaconBlock,
  },
  capella: {
    BeaconBlockBody: capella.BlindedBeaconBlockBody,
    BeaconBlock: capella.BlindedBeaconBlock,
    SignedBeaconBlock: capella.SignedBlindedBeaconBlock,
  },
};
