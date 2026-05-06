const fs = require('fs');
const path = require('path');

const offeringsPath = path.join('c:', 'Users', 'CEEJAY', 'Documents', 'COLLEGE', '2ND YEAR', 'SECOND SEMESTER', 'app dev', 'VLAD_prototype', 'data', 'offerings.json');

const OLD_MAP = {
  'ACCA': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'ACCP': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'AIMI': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'AIMP': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'ARCH': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'BCGA': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'CALC': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'CENG': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'CGAE': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'CGAF': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'CGAM': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'CGAP': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'CHEM': { level: 'Hard', color: '#f97316', score: 3.5, bg: 'rgba(249, 115, 22, 0.1)' },
  'COMP': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'CRCP': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'CSDC': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'CSEC': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'CSMC': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'ISEC': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'ISMC': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'ITEC': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'ITMC': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'MCGA': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'MITC': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'MITP': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'MITS': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'MIWR': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'MMTH': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'MSCS': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'NCMC': { level: 'Hard', color: '#f97316', score: 3.5, bg: 'rgba(249, 115, 22, 0.1)' },
  'NCMP': { level: 'Hard', color: '#f97316', score: 3.5, bg: 'rgba(249, 115, 22, 0.1)' },
  'NSCS': { level: 'Hard', color: '#f97316', score: 3.5, bg: 'rgba(249, 115, 22, 0.1)' },
  'QCPA': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'QCPE': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'QCPP': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'QECA': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'QECC': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'QECE': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'QECP': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'STAT': { level: 'Hard', color: '#f97316', score: 3.5, bg: 'rgba(249, 115, 22, 0.1)' },
  'SYST': { level: 'Hard', color: '#ef4444', score: 4, bg: 'rgba(239, 68, 68, 0.1)' },
  'ACCL': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ACCT': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ACEL': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ACIN': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ACOT': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ACRE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'BABF': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'BACC': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'BAEL': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'BALE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'BALM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'BAMA': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'BAME': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'BAMM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'BATT': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'BLLM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'BMHP': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'BPHY': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'BRDM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'CAED': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'CBAC': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'CBAE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'CBAR': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'CIFP': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'CIGC': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'COME': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'COMN': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'DBAC': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'DBAD': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'DBAF': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'DCOM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'DEVB': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'DEVC': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'DEVE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'DVCE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ECED': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ECEL': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ECSM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'EDBS': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'EDCI': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'EDES': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'EDFD': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'EDFI': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'EDLM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'EDLT': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'EDPE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'EDPS': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'EDSE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'EDSS': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'EDTM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'EDUC': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'EDUM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'EDUP': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ED__': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'EIAS': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ELEM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ELT_': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ENCO': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ENGE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ENGS': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ENPE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ENPM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ENSM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ENTC': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'EPSY': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ESB_': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ESCH': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ESC_': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ETOX': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'EVOL': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'FILE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'FILS': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'FLAN': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'FMAC': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'FMAP': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'FMBR': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'FMCC': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'FMCE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'FMCL': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'FMCT': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'GEAL': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'GENE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ICST': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'ISAI': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'JRNE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'JRNM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'LAND': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'LISM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'LITC': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'LITE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'LIT_': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'LLD ': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'LLD_': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'LOJT': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'LSM_': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'LSPT': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'MAED': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'MA__': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'MBA_': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'MMBA': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'MMPA': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'MSAB': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'MSAM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'MSAT': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'MSGE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'MTED': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'MTHC': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'MTHE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'MTHR': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'MTHS': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'NSG_': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PA__': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PEEN': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PEMC': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PHFS': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PHIL': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PHIN': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PHIS': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PHI_': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PHPL': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PSEC': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PSED': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PSEG': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PSEI': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PSEM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PSSC': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PSSE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PSSM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PSYB': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PSYC': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PSYM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PSYP': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'PSY_': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'RED_': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'RESE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'RESY': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'REVM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'RPSY': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'RS__': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'SCED': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'SNED': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'SOCS': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'SPEC': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'THEM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'THEN': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'TMCS': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'TMPC': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'TMPE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'VALM': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'WMTE': { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' },
  'GC__': { level: 'Easy', color: '#22c55e', score: 1.5, bg: 'rgba(34, 197, 94, 0.1)' },
  'GECC': { level: 'Easy', color: '#22c55e', score: 1.5, bg: 'rgba(34, 197, 94, 0.1)' },
  'GEMT': { level: 'Easy', color: '#22c55e', score: 1.5, bg: 'rgba(34, 197, 94, 0.1)' },
  'GESC': { level: 'Easy', color: '#22c55e', score: 1.5, bg: 'rgba(34, 197, 94, 0.1)' },
  'NSTP': { level: 'Easy', color: '#22c55e', score: 1, bg: 'rgba(34, 197, 94, 0.1)' },
  'PFIT': { level: 'Easy', color: '#22c55e', score: 1, bg: 'rgba(34, 197, 94, 0.1)' },
};

try {
    const data = JSON.parse(fs.readFileSync(offeringsPath, 'utf8'));
    const subjectPrefixes = new Set();
    
    data.forEach(item => {
        if (item.course_code) {
            const match = item.course_code.match(/^[A-Z]+/i);
            if (match) {
                let prefix = match[0].toUpperCase().substring(0, 4);
                subjectPrefixes.add(prefix);
            }
        }
    });

    const sortedPrefixes = Array.from(subjectPrefixes).sort();
    const newMap = {};
    
    sortedPrefixes.forEach(prefix => {
        // Try exact match
        if (OLD_MAP[prefix]) {
            newMap[prefix] = OLD_MAP[prefix];
        } else {
            // Try match with underscores
            const underscoreMatches = Object.keys(OLD_MAP).filter(k => k.startsWith(prefix) && k.includes('_'));
            if (underscoreMatches.length > 0) {
                newMap[prefix] = OLD_MAP[underscoreMatches[0]];
            } else {
                // Default
                newMap[prefix] = { level: 'Moderate', color: '#eab308', score: 2.5, bg: 'rgba(234, 179, 8, 0.1)' };
            }
        }
    });

    // Special handling for known easy ones that might be new
    if (newMap['NSTP']) newMap['NSTP'] = { level: 'Easy', color: '#22c55e', score: 1, bg: 'rgba(34, 197, 94, 0.1)' };
    if (newMap['PFIT']) newMap['PFIT'] = { level: 'Easy', color: '#22c55e', score: 1, bg: 'rgba(34, 197, 94, 0.1)' };
    if (newMap['GC']) newMap['GC'] = { level: 'Easy', color: '#22c55e', score: 1.5, bg: 'rgba(34, 197, 94, 0.1)' };

    // Format output
    let output = 'export const DIFFICULTY_MAP = {\n';
    
    // Group by level
    const levels = ['Hard', 'Moderate', 'Easy'];
    levels.forEach(level => {
        output += `  // === ${level.toUpperCase()} ===\n`;
        Object.keys(newMap).sort().forEach(key => {
            if (newMap[key].level === level) {
                output += `  '${key}': ${JSON.stringify(newMap[key])},\n`;
            }
        });
        output += '\n';
    });
    output += '};\n\n';
    
    output += `export const getDifficulty = (courseCode) => {
  if (!courseCode) return { level: 'Unknown', color: '#94a3b8', score: 0, bg: 'transparent' };
  
  // Extract alphabetical prefix (up to 4 letters)
  const match = courseCode.match(/^[A-Z]+/i);
  if (!match) return { level: 'Moderate', color: '#eab308', score: 2, bg: 'rgba(234, 179, 8, 0.1)' };
  
  const prefix = match[0].toUpperCase().substring(0, 4);
  
  if (DIFFICULTY_MAP[prefix]) return DIFFICULTY_MAP[prefix];

  // Try shorter prefixes (for codes like ED or GC)
  for (let i = prefix.length - 1; i >= 1; i--) {
    const shorter = prefix.substring(0, i);
    if (DIFFICULTY_MAP[shorter]) return DIFFICULTY_MAP[shorter];
  }

  // Default to Moderate
  return { level: 'Moderate', color: '#eab308', score: 2, bg: 'rgba(234, 179, 8, 0.1)' };
};
`;

    fs.writeFileSync('c:/Users/CEEJAY/Documents/COLLEGE/2ND YEAR/SECOND SEMESTER/app dev/VLAD_prototype/client/src/difficulty_map.js', output);
    console.log('Successfully updated difficulty_map.js');

} catch (error) {
    console.error('Error:', error);
}
