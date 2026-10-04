/**
 * Extensions couvertes : données Scryfall (data/<set>.json) et scripts des cartes.
 * L'ordre compte : une réimpression (même nom) garde la définition de la première extension.
 */
import type { CardDef, CardScript } from "@mtgx/engine";
import bigData from "../data/big.json";
import blbData from "../data/blb.json";
import dftData from "../data/dft.json";
import dskData from "../data/dsk.json";
import eclData from "../data/ecl.json";
import eoeData from "../data/eoe.json";
import eosData from "../data/eos.json";
import fcaData from "../data/fca.json";
import fdnData from "../data/fdn.json";
import finData from "../data/fin.json";
import fraData from "../data/fra.json";
import hobData from "../data/hob.json";
import lciData from "../data/lci.json";
import mkmData from "../data/mkm.json";
import mshData from "../data/msh.json";
import otjData from "../data/otj.json";
import otpData from "../data/otp.json";
import pzaData from "../data/pza.json";
import rexData from "../data/rex.json";
import soaData from "../data/soa.json";
import sosData from "../data/sos.json";
import spgData from "../data/spg.json";
import spmData from "../data/spm.json";
import tdmData from "../data/tdm.json";
import tlaData from "../data/tla.json";
import tmtData from "../data/tmt.json";
import woeData from "../data/woe.json";
import wotData from "../data/wot.json";
import { BIG_SCRIPTS } from "./big/index";
import { BLB_SCRIPTS } from "./blb/index";
import { DFT_SCRIPTS } from "./dft/index";
import { DSK_SCRIPTS } from "./dsk/index";
import { ECL_SCRIPTS } from "./ecl/index";
import { EOE_SCRIPTS } from "./eoe/index";
import { EOS_SCRIPTS } from "./eos/index";
import { FCA_SCRIPTS } from "./fca/index";
import { FDN_SCRIPTS } from "./fdn/index";
import { FIN_SCRIPTS } from "./fin/index";
import { FRA_SCRIPTS } from "./fra/index";
import { HOB_SCRIPTS } from "./hob/index";
import { LCI_SCRIPTS } from "./lci/index";
import { MKM_SCRIPTS } from "./mkm/index";
import { MSH_SCRIPTS } from "./msh/index";
import { OTJ_SCRIPTS } from "./otj/index";
import { OTP_SCRIPTS } from "./otp/index";
import { PZA_SCRIPTS } from "./pza/index";
import { REX_SCRIPTS } from "./rex/index";
import type { RawCard } from "./scryfall";
import { SET_INFO, type SetInfo } from "./setRegistry";
import { SOA_SCRIPTS } from "./soa/index";
import { SOS_SCRIPTS } from "./sos/index";
import { SPG_SCRIPTS } from "./spg/index";
import { SPM_SCRIPTS } from "./spm/index";
import { TDM_SCRIPTS } from "./tdm/index";
import { TLA_SCRIPTS } from "./tla/index";
import { TMT_SCRIPTS } from "./tmt/index";
import { WOE_SCRIPTS } from "./woe/index";
import { WOT_SCRIPTS } from "./wot/index";

export interface CardSet extends SetInfo {
  data: RawCard[];
  scripts: Record<string, CardScript>;
}

const DATA: Record<string, unknown> = {
  FDN: fdnData,
  FRA: fraData,
  EOE: eoeData,
  DFT: dftData,
  OTJ: otjData,
  BIG: bigData,
  BLB: blbData,
  TDM: tdmData,
  WOE: woeData,
  SOS: sosData,
  ECL: eclData,
  TLA: tlaData,
  SPM: spmData,
  MSH: mshData,
  TMT: tmtData,
  HOB: hobData,
  MKM: mkmData,
  DSK: dskData,
  LCI: lciData,
  FIN: finData,
  SPG: spgData,
  EOS: eosData,
  WOT: wotData,
  OTP: otpData,
  FCA: fcaData,
  SOA: soaData,
  PZA: pzaData,
  REX: rexData,
};

const SCRIPTS: Record<string, Record<string, CardScript>> = {
  FDN: FDN_SCRIPTS,
  FRA: FRA_SCRIPTS,
  EOE: EOE_SCRIPTS,
  DFT: DFT_SCRIPTS,
  OTJ: OTJ_SCRIPTS,
  BIG: BIG_SCRIPTS,
  BLB: BLB_SCRIPTS,
  TDM: TDM_SCRIPTS,
  WOE: WOE_SCRIPTS,
  SOS: SOS_SCRIPTS,
  ECL: ECL_SCRIPTS,
  TLA: TLA_SCRIPTS,
  SPM: SPM_SCRIPTS,
  MSH: MSH_SCRIPTS,
  TMT: TMT_SCRIPTS,
  HOB: HOB_SCRIPTS,
  MKM: MKM_SCRIPTS,
  DSK: DSK_SCRIPTS,
  LCI: LCI_SCRIPTS,
  FIN: FIN_SCRIPTS,
  SPG: SPG_SCRIPTS,
  EOS: EOS_SCRIPTS,
  WOT: WOT_SCRIPTS,
  OTP: OTP_SCRIPTS,
  FCA: FCA_SCRIPTS,
  SOA: SOA_SCRIPTS,
  PZA: PZA_SCRIPTS,
  REX: REX_SCRIPTS,
};

export const SETS: CardSet[] = SET_INFO.map((info) => ({
  ...info,
  data: DATA[info.code] as RawCard[],
  scripts: SCRIPTS[info.code] as Record<string, CardScript>,
}));

export const SET_BY_CODE: Record<string, CardSet> = Object.fromEntries(SETS.map((s) => [s.code, s]));

/** Carte du set principal de son extension (numéro de collection jusqu'à `mainMax`, terrains de base compris). */
export function isMainSet(c: CardDef): boolean {
  const set = c.set ? SET_BY_CODE[c.set] : undefined;
  return !c.isToken && !!set && Number.parseInt(c.number ?? "999", 10) <= set.mainMax;
}
