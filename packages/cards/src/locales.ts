/**
 * French catalogs of the cards package (PLAN-I): `core` for the files at the root of `src/` and the tokens, then one
 * file per set directory (`src/<set>/` → `locales/fr/<set>.json`). Every file of `locales/fr/` is listed here
 * (`cards/test/locales.test.ts` checks it).
 */

import big from "../locales/fr/big.json";
import blb from "../locales/fr/blb.json";
import core from "../locales/fr/core.json";
import dft from "../locales/fr/dft.json";
import dsk from "../locales/fr/dsk.json";
import ecl from "../locales/fr/ecl.json";
import edh from "../locales/fr/edh.json";
import eoe from "../locales/fr/eoe.json";
import eos from "../locales/fr/eos.json";
import fca from "../locales/fr/fca.json";
import fdn from "../locales/fr/fdn.json";
import fin from "../locales/fr/fin.json";
import fra from "../locales/fr/fra.json";
import hob from "../locales/fr/hob.json";
import lci from "../locales/fr/lci.json";
import mkm from "../locales/fr/mkm.json";
import msh from "../locales/fr/msh.json";
import otj from "../locales/fr/otj.json";
import otp from "../locales/fr/otp.json";
import pza from "../locales/fr/pza.json";
import rex from "../locales/fr/rex.json";
import soa from "../locales/fr/soa.json";
import sos from "../locales/fr/sos.json";
import spg from "../locales/fr/spg.json";
import spm from "../locales/fr/spm.json";
import tdm from "../locales/fr/tdm.json";
import tla from "../locales/fr/tla.json";
import tmt from "../locales/fr/tmt.json";
import woe from "../locales/fr/woe.json";
import wot from "../locales/fr/wot.json";

export const FRENCH_CATALOGS: Record<string, Record<string, string>> = {
  core,
  big,
  blb,
  dft,
  dsk,
  ecl,
  edh,
  eoe,
  eos,
  fca,
  fdn,
  fin,
  fra,
  hob,
  lci,
  mkm,
  msh,
  otj,
  otp,
  pza,
  rex,
  soa,
  sos,
  spg,
  spm,
  tdm,
  tla,
  tmt,
  woe,
  wot,
};
