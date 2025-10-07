#!/usr/bin/env node
/**
 * Update orphaned contacts with high-confidence Account matches
 * Generated: 2025-09-22T21:08:51.524Z
 */

const { execSync } = require('child_process');

const updates = [
  {
    "contactId": "0033j00003gTsH2AAK",
    "contactName": "Taylor King",
    "contactEmail": "10westedge@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU08MAAS",
    "contactName": "Diana Coleman",
    "contactEmail": "annapolis@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrB8AAK",
    "contactName": "Angela Bellamy",
    "contactEmail": "ansonatthelakes@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvZaAAK",
    "contactName": "Brooke Buie",
    "contactEmail": "buckheadwest@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUJxzAAG",
    "contactName": "Shanice Clayton",
    "contactEmail": "capitolhill@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrdQAAS",
    "contactName": "Teresa Faucette-Stancil",
    "contactEmail": "fallsatforsyth@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTyQkAAK",
    "contactName": "Laura Dominguez",
    "contactEmail": "fourpoints@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqF8AAK",
    "contactName": "Lorien Rollins",
    "contactEmail": "greysharboratlakenorman@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrSfAAK",
    "contactName": "Robin Hixson",
    "contactEmail": "greystone@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTsHSAA0",
    "contactName": "Patrick .",
    "contactEmail": "kimballtowers@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTs0cAAC",
    "contactName": "Jessie Friedman",
    "contactEmail": "olmstedpark@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPIoAAO",
    "contactName": "Barbara Sodek",
    "contactEmail": "quarryhill@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzrGAAS",
    "contactName": "Michelle Garcia",
    "contactEmail": "southlamar@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqlmAAC",
    "contactName": "Karmen Alvarado",
    "contactEmail": "southpark@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPNCAA4",
    "contactName": "Eric Johnson",
    "contactEmail": "tapestry@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTnsKAAS",
    "contactName": "Stormy .",
    "contactEmail": "teravista@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPVrAAO",
    "contactName": "Emily Guiney",
    "contactEmail": "thewesterly@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrXwAAK",
    "contactName": "Dana Kelley",
    "contactEmail": "tryonparkatrivergate@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqWsAAK",
    "contactName": "Victoria Barley",
    "contactEmail": "vinings@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTnKkAAK",
    "contactName": "Alexandra Payne",
    "contactEmail": "willowsatfortmill@bellpartnersinc.com",
    "suggestedAccountId": "0013j00002dM0H4AAK",
    "suggestedAccountName": "Bell Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTsMOAA0",
    "contactName": "Erica Regan",
    "contactEmail": "12th_james@aspensquare.com",
    "suggestedAccountId": "001F000001GOn2YIAT",
    "suggestedAccountName": "Aspen Square Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUOnqAAG",
    "contactName": "Anashaia Tolliver",
    "contactEmail": "4975@aspensquare.com",
    "suggestedAccountId": "001F000001GOn2YIAT",
    "suggestedAccountName": "Aspen Square Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPP4AAO",
    "contactName": "Samantha Sze",
    "contactEmail": "alpine_commons@aspensquare.com",
    "suggestedAccountId": "001F000001GOn2YIAT",
    "suggestedAccountName": "Aspen Square Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxQgAAK",
    "contactName": "Jessica Huesman",
    "contactEmail": "reserves_atmonroe@aspensquare.com",
    "suggestedAccountId": "001F000001GOn2YIAT",
    "suggestedAccountName": "Aspen Square Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTwV4AAK",
    "contactName": "Jordan Green",
    "contactEmail": "river_bluff@aspensquare.com",
    "suggestedAccountId": "001F000001GOn2YIAT",
    "suggestedAccountName": "Aspen Square Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTntpAAC",
    "contactName": "Bobbie Longlo",
    "contactEmail": "southwood_acres@aspensquare.com",
    "suggestedAccountId": "001F000001GOn2YIAT",
    "suggestedAccountName": "Aspen Square Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUKKfAAO",
    "contactName": "Heather Alexander",
    "contactEmail": "the_legends@aspensquare.com",
    "suggestedAccountId": "001F000001GOn2YIAT",
    "suggestedAccountName": "Aspen Square Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002dUDCzQAO",
    "contactName": "Larry Lorentzen",
    "contactEmail": "1409@screntals.com",
    "suggestedAccountId": "0012A00002D1kHTQAZ",
    "suggestedAccountName": "SC Rentals (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002dUDD0QAO",
    "contactName": "Constance Dohn",
    "contactEmail": "prospectstation@screntals.com",
    "suggestedAccountId": "0012A00002D1kHTQAZ",
    "suggestedAccountName": "SC Rentals (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH67AAG",
    "contactName": "Amanda Scott",
    "contactEmail": "1430q.bd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH21AAG",
    "contactName": "Bobby Rishwain",
    "contactEmail": "17central.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHIRAA4",
    "contactName": "Jennifer Scarr",
    "contactEmail": "2300west.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHAhAAO",
    "contactName": "Cindy Guzman",
    "contactEmail": "ageno.info@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHE0AAO",
    "contactName": "Precious Pingol",
    "contactEmail": "alamogarden.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH9fAAG",
    "contactName": "Martha Mojica",
    "contactEmail": "alexandra.jimenez@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHJ0AAO",
    "contactName": "Adam Dubia",
    "contactEmail": "arpeggio.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH95AAG",
    "contactName": "Tara Chavez",
    "contactEmail": "aspire.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH8bAAG",
    "contactName": "Steven Borden",
    "contactEmail": "aspirearden.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH8gAAG",
    "contactName": "Ari Lopez",
    "contactEmail": "aster.lease@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHAwAAO",
    "contactName": "Lorraine Gonzalez",
    "contactEmail": "austincommons@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHBuAAO",
    "contactName": "Sandra De La Cruz",
    "contactEmail": "azara.lease@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHEjAAO",
    "contactName": "Angelina Grengs",
    "contactEmail": "ballantyne.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHEyAAO",
    "contactName": "Lorena Inojosa",
    "contactEmail": "baxter.leasemgr@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHHJAA4",
    "contactName": "Veronica Arteaga",
    "contactEmail": "bidwellparkfremont.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH96AAG",
    "contactName": "Xochitl Logan",
    "contactEmail": "calavowoods.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHFSAA4",
    "contactName": "Claudia Raya",
    "contactEmail": "capistranopark.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHFmAAO",
    "contactName": "Michelle LeBlanc",
    "contactEmail": "casasnuevas.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHHsAAO",
    "contactName": "Evelyn Khamo",
    "contactEmail": "cedarglen.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH6RAAW",
    "contactName": "Celeste McGillen",
    "contactEmail": "celeste.mcgillen@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH9zAAG",
    "contactName": "Maurine McCrory",
    "contactEmail": "chevychase.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHF3AAO",
    "contactName": "Katie Harney",
    "contactEmail": "conradvillas.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHFNAA4",
    "contactName": "Donya Sandoval",
    "contactEmail": "corinthian.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHI7AAO",
    "contactName": "Shawna Johnson",
    "contactEmail": "countrysidevillage.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH22AAG",
    "contactName": "Karen Taylor",
    "contactEmail": "creeksidepark.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH6fAAG",
    "contactName": "Chantelle Gamberling",
    "contactEmail": "crownridge.lease@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHEKAA4",
    "contactName": "Dania Sandoval",
    "contactEmail": "dorianacd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHAJAA4",
    "contactName": "Angela Polhac",
    "contactEmail": "dublinranch.assist@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH7nAAG",
    "contactName": "Rachael De La Cruz",
    "contactEmail": "elverano.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH8CAAW",
    "contactName": "Erinn Tardif",
    "contactEmail": "erinn.tardif@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH9LAAW",
    "contactName": "Whitney Galindo",
    "contactEmail": "fayettearms.assist@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHCnAAO",
    "contactName": "Savannah Scholebo",
    "contactEmail": "fiesta.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHCiAAO",
    "contactName": "Marye Scott",
    "contactEmail": "florence.compliance@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHDMAA4",
    "contactName": "Mina Khoshkbariyeh",
    "contactEmail": "fountainsdublin.lease@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHEoAAO",
    "contactName": "Cristle David",
    "contactEmail": "foxborough.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHGpAAO",
    "contactName": "Beatriz Gomez",
    "contactEmail": "gateway.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH6LAAW",
    "contactName": "Cindy Nugyen",
    "contactEmail": "greystonevillage.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH9tAAG",
    "contactName": "Ashley Johnson",
    "contactEmail": "harborpoint.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHASAA4",
    "contactName": "La Tonya Glover",
    "contactEmail": "harriettubmanterrace.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH8cAAG",
    "contactName": "Kenneth Odell",
    "contactEmail": "heritageplaza.assist@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHGzAAO",
    "contactName": "Alejanra Caseillo",
    "contactEmail": "hiddenmeadows.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH7iAAG",
    "contactName": "Isaiah Cruz",
    "contactEmail": "isaiah.cruz@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH8qAAG",
    "contactName": "Crystal Lopez",
    "contactEmail": "jacksonflats.assist@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHBpAAO",
    "contactName": "Jennifer Pharr",
    "contactEmail": "jennifer.pharr@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHDvAAO",
    "contactName": "Jessica Santillano",
    "contactEmail": "jessica.santillano@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH7eAAG",
    "contactName": "Jessica Skain",
    "contactEmail": "jessica.skain@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHC5AAO",
    "contactName": "Jose Martinez",
    "contactEmail": "jose.martinez@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHCsAAO",
    "contactName": "Kimberly Reaves",
    "contactEmail": "kimberly.reaves@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHHiAAO",
    "contactName": "Andrea Garcia",
    "contactEmail": "lakeshoremeadows.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHH4AAO",
    "contactName": "Christina Douglas",
    "contactEmail": "laplacitacinco.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHIgAAO",
    "contactName": "Teresa Ponpareli",
    "contactEmail": "laprovence.assist@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHF4AAO",
    "contactName": "Priscilla Penaloza",
    "contactEmail": "lashaciendas.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHJUAA4",
    "contactName": "Taniesha Bowman",
    "contactEmail": "lasventanaslb.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH79AAG",
    "contactName": "Lydia Da Silva",
    "contactEmail": "lydia.dasilva@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTsRUAA0",
    "contactName": "Megan Milich",
    "contactEmail": "megan.milich@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH1qAAG",
    "contactName": "Jillian Stanwood",
    "contactEmail": "mewsdixonfarm.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH6kAAG",
    "contactName": "Caroline Aguirre",
    "contactEmail": "missionterracesandiego.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHCAAA4",
    "contactName": "Natasha Smith",
    "contactEmail": "natasha.smith@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH6gAAG",
    "contactName": "Rose Rosales",
    "contactEmail": "nichollette.burrows@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHIvAAO",
    "contactName": "Linda Tran",
    "contactEmail": "nilesstation.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH8hAAG",
    "contactName": "Elizabeth Olaya",
    "contactEmail": "northgateplaza@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH7TAAW",
    "contactName": "Jason Fuentes",
    "contactEmail": "orion.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHBLAA4",
    "contactName": "Rosa Bustamante",
    "contactEmail": "palmdalia.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHBfAAO",
    "contactName": "Manuel Cortez",
    "contactEmail": "palmilla.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH8vAAG",
    "contactName": "Lori Donahou",
    "contactEmail": "polorun.lease@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH59AAG",
    "contactName": "Melissa Maxedon",
    "contactEmail": "quailrun.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHDWAA4",
    "contactName": "Brittany Colletti",
    "contactEmail": "ramonavillage.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHHYAA4",
    "contactName": "Rodneisha Cannon",
    "contactEmail": "reardon.heights@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHFiAAO",
    "contactName": "Delia Pantoja",
    "contactEmail": "redwoodgardenselcajon.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHIbAAO",
    "contactName": "Grisell Nunez",
    "contactEmail": "regency.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHF8AAO",
    "contactName": "Patrica Greechan",
    "contactEmail": "rivieradeville.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH9FAAW",
    "contactName": "Victor Albano",
    "contactEmail": "serranohighlands.assist@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHCxAAO",
    "contactName": "Valerie Cechvala",
    "contactEmail": "silveradoramona.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHFXAA4",
    "contactName": "Katherine Shirley",
    "contactEmail": "solimar.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH2UAAW",
    "contactName": "Michelle Paredes",
    "contactEmail": "southpeak.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH5wAAG",
    "contactName": "Alyssa Trent",
    "contactEmail": "stonebrier.cd1@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUKXRAA4",
    "contactName": "Taylor Giles",
    "contactEmail": "summerlyn.lease@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHDbAAO",
    "contactName": "Kimberlee Scoggin",
    "contactEmail": "svcommons.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH54AAG",
    "contactName": "Abel Mendoza",
    "contactEmail": "tarahill.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHEfAAO",
    "contactName": "Bianca Ochoa",
    "contactEmail": "terracamarillo.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHICAA4",
    "contactName": "Cecilia Ruiz-Varela",
    "contactEmail": "thearlo.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHIWAA4",
    "contactName": "Sandra Deasy",
    "contactEmail": "theazure.lease1@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH5YAAW",
    "contactName": "Tasheena Florez",
    "contactEmail": "thebridgesvs.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH61AAG",
    "contactName": "Elisabethe Morlok",
    "contactEmail": "thebungalowsskyvista.lease@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH7sAAG",
    "contactName": "Marissa Terea",
    "contactEmail": "thedecovs.lease@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHAIAA4",
    "contactName": "Andy Cambano",
    "contactEmail": "thelandingatci.leasing@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHBaAAO",
    "contactName": "Donelle Frederick",
    "contactEmail": "thepalms.leasingmanager@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHDRAA4",
    "contactName": "Casey Berry",
    "contactEmail": "theretreatreno.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHEAAA4",
    "contactName": "Katherine Hundzinski",
    "contactEmail": "tidesatgrandterrace@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHG6AAO",
    "contactName": "Stephanie Nosfinger",
    "contactEmail": "tierradelsol.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHH9AAO",
    "contactName": "Alyssa Rynhard",
    "contactEmail": "townecentre.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHHTAA4",
    "contactName": "Angelina Grengs",
    "contactEmail": "townplaza.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003OQnFDAA1",
    "contactName": "Kristopher Nittler",
    "contactEmail": "traditionsenglewood.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHI2AAO",
    "contactName": "Mara Ponce",
    "contactEmail": "tuscanyvillasn.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHCoAAO",
    "contactName": "Jennifer Myers",
    "contactEmail": "vasari.leasing@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHBkAAO",
    "contactName": "Fred Grinder",
    "contactEmail": "villaswoodlandhills.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH6HAAW",
    "contactName": "Erica Mackie",
    "contactEmail": "vintageranch.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH9GAAW",
    "contactName": "Brittany Rowland",
    "contactEmail": "vintagesanctuary.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHCYAA4",
    "contactName": "Denise Servin",
    "contactEmail": "vistalane.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHEPAA4",
    "contactName": "Erica Moon",
    "contactEmail": "walnuthill.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHFOAA4",
    "contactName": "Margarita Jones",
    "contactEmail": "woodglen.cd@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH6uAAG",
    "contactName": "Azam Jabbari",
    "contactEmail": "woodstream.lease@fpimgt.com",
    "suggestedAccountId": "001F000001GXHJNIA5",
    "suggestedAccountName": "FPI Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0avAAC",
    "contactName": "Amy Stanely",
    "contactEmail": "23hundred@sentinelcorp.com",
    "suggestedAccountId": "0013j00003Hk04yAAB",
    "suggestedAccountName": "Sentinel Real Estate Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0O5AAK",
    "contactName": "Christy Russell",
    "contactEmail": "abquptownl@sentinelcorp.com",
    "suggestedAccountId": "0013j00003Hk04yAAB",
    "suggestedAccountName": "Sentinel Real Estate Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTza5AAC",
    "contactName": "Lisa Hernandez",
    "contactEmail": "centrepointe@sentinelcorp.com",
    "suggestedAccountId": "0013j00003Hk04yAAB",
    "suggestedAccountName": "Sentinel Real Estate Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTuEFAA0",
    "contactName": "Terence Lawson",
    "contactEmail": "evergreenl@sentinelcorp.com",
    "suggestedAccountId": "0013j00003Hk04yAAB",
    "suggestedAccountName": "Sentinel Real Estate Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqbYAAS",
    "contactName": "Christie McVay",
    "contactEmail": "gardens@sentinelcorp.com",
    "suggestedAccountId": "0013j00003Hk04yAAB",
    "suggestedAccountName": "Sentinel Real Estate Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPbvAAG",
    "contactName": "April Angell",
    "contactEmail": "glenbrook@sentinelcorp.com",
    "suggestedAccountId": "0013j00003Hk04yAAB",
    "suggestedAccountName": "Sentinel Real Estate Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpZaAAK",
    "contactName": "Cindy Edwards",
    "contactEmail": "hayeshouse@sentinelcorp.com",
    "suggestedAccountId": "0013j00003Hk04yAAB",
    "suggestedAccountName": "Sentinel Real Estate Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUKdXAAW",
    "contactName": "Tina Brooks",
    "contactEmail": "oaks@sentinelcorp.com",
    "suggestedAccountId": "0013j00003Hk04yAAB",
    "suggestedAccountName": "Sentinel Real Estate Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxz4AAC",
    "contactName": "Louis Anderson",
    "contactEmail": "perimetergardens@sentinelcorp.com",
    "suggestedAccountId": "0013j00003Hk04yAAB",
    "suggestedAccountName": "Sentinel Real Estate Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUEX0AAO",
    "contactName": "Rachel C",
    "contactEmail": "30dalton@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrBJAA0",
    "contactName": "Michele Peluso",
    "contactEmail": "arborsbaltimore@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUK9tAAG",
    "contactName": "Stephanie Cook",
    "contactEmail": "bethesdahill@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTyz0AAC",
    "contactName": "Anthony Bagge",
    "contactEmail": "cambridgepark@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTtYmAAK",
    "contactName": "Nicole Wogh",
    "contactEmail": "chasemanor@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTsXNAA0",
    "contactName": "Jon Edgerton",
    "contactEmail": "citymarket@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUJIFAA4",
    "contactName": "Jennifer Libby",
    "contactEmail": "devonshire@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqtzAAC",
    "contactName": "Luther Crawford",
    "contactEmail": "enclave@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUKFLAA4",
    "contactName": "Krystal DeBernardo",
    "contactEmail": "enclaveboxhill@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTsEkAAK",
    "contactName": "Amanda Cooper",
    "contactEmail": "fieldsidevillage@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUBQxAAO",
    "contactName": "Octavia Watson",
    "contactEmail": "flats130@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUBVzAAO",
    "contactName": "Antonia Sonders",
    "contactEmail": "fourwinds@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpYZAA0",
    "contactName": "Kayla Balamotis",
    "contactEmail": "fuse@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrjuAAC",
    "contactName": "Jeff Long",
    "contactEmail": "jlong@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpUiAAK",
    "contactName": "Sharron Howard",
    "contactEmail": "kenmore@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrclAAC",
    "contactName": "Daniel Pereira",
    "contactEmail": "kensington@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqIlAAK",
    "contactName": "Kara Trust",
    "contactEmail": "lakeside@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTw8yAAC",
    "contactName": "Corinne Goldsmith",
    "contactEmail": "marinerbay@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzFWAA0",
    "contactName": "Callah Sponheimer",
    "contactEmail": "merielmarinabay@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUJNXAA4",
    "contactName": "Jennifer Livingston",
    "contactEmail": "metropolitan@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTx9qAAC",
    "contactName": "Steven Wessel",
    "contactEmail": "newseum@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0OkAAK",
    "contactName": "Danielle Forand",
    "contactEmail": "onegreenway@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0b5AAC",
    "contactName": "Harry Murphine",
    "contactEmail": "palatine@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTnryAAC",
    "contactName": "Ashana Bastola",
    "contactEmail": "parkadams@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUK2eAAG",
    "contactName": "Kayla Gallagher",
    "contactEmail": "parklane@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTn6gAAC",
    "contactName": "Nancy Buruca",
    "contactEmail": "roosevelttowers@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPISAA4",
    "contactName": "Jessica Davidson",
    "contactEmail": "silverwood@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvsjAAC",
    "contactName": "Devon Bynum",
    "contactEmail": "strathmore@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzVwAAK",
    "contactName": "Taylor Abercrombie",
    "contactEmail": "taylor.abercrombie@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUOtRAAW",
    "contactName": "Julie Ruppert",
    "contactEmail": "theapollo@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTtezAAC",
    "contactName": "Bradley Halverson-Oxford",
    "contactEmail": "theavenue@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPHTAA4",
    "contactName": "Chelsea Morton",
    "contactEmail": "theberkleigh@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTr9vAAC",
    "contactName": "Angela Santiago",
    "contactEmail": "theeliot@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTr5WAAS",
    "contactName": "Jeanette Holeman",
    "contactEmail": "theglen@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzDtAAK",
    "contactName": "Aaron Cramer",
    "contactEmail": "theharlo@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTw3DAAS",
    "contactName": "Janelle Edlow",
    "contactEmail": "theharvey@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTu6XAAS",
    "contactName": "Lisa Evans",
    "contactEmail": "thevine@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUE97AAG",
    "contactName": "Kimberly McDougal",
    "contactEmail": "thewhitney@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTsBQAA0",
    "contactName": "Alana Ferrari",
    "contactEmail": "twenty20@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTwA6AAK",
    "contactName": "Marcuita Sweeting",
    "contactEmail": "vantagemosaic@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPhSAAW",
    "contactName": "Kimberly Eley",
    "contactEmail": "westbroad@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzR8AAK",
    "contactName": "Ryan Watts",
    "contactEmail": "woodfallgreens@bozzuto.com",
    "suggestedAccountId": "001F000001fe448IAA",
    "suggestedAccountName": "Bozzuto Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTn7cAAC",
    "contactName": "Brittany Mullen",
    "contactEmail": "345flats@peakcampus.com",
    "suggestedAccountId": "001Rh00000KzmpnIAB",
    "suggestedAccountName": "Peak Campus Cos",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hEFQAY",
    "contactName": "Christina Bartos",
    "contactEmail": "cbartos@peakcampus.com",
    "suggestedAccountId": "001Rh00000KzmpnIAB",
    "suggestedAccountName": "Peak Campus Cos",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTp1iAAC",
    "contactName": "Bo Schneider",
    "contactEmail": "cpcincy@peakcampus.com",
    "suggestedAccountId": "001Rh00000KzmpnIAB",
    "suggestedAccountName": "Peak Campus Cos",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPADAA4",
    "contactName": "Chyanne Smithstehr",
    "contactEmail": "csmithstehr@peakcampus.com",
    "suggestedAccountId": "001Rh00000KzmpnIAB",
    "suggestedAccountName": "Peak Campus Cos",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpNbAAK",
    "contactName": "Erik Rowan",
    "contactEmail": "edgeoneuclid@peakcampus.com",
    "suggestedAccountId": "001Rh00000KzmpnIAB",
    "suggestedAccountName": "Peak Campus Cos",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002vYBL7QAO",
    "contactName": "Kaylene Dabbs",
    "contactEmail": "kdabbs@peakcampus.com",
    "suggestedAccountId": "001Rh00000KzmpnIAB",
    "suggestedAccountName": "Peak Campus Cos",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTyUbAAK",
    "contactName": "Shannian Howard",
    "contactEmail": "380harding@firstcommunities.com",
    "suggestedAccountId": "0012A00002D1kUOQAZ",
    "suggestedAccountName": "Asset Living (Atlanta North)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTtU9AAK",
    "contactName": "James McGee",
    "contactEmail": "500fifth@firstcommunities.com",
    "suggestedAccountId": "0012A00002D1kUOQAZ",
    "suggestedAccountName": "Asset Living (Atlanta North)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTy8sAAC",
    "contactName": "Abnel .",
    "contactEmail": "acalderon@firstcommunities.com",
    "suggestedAccountId": "0012A00002D1kUOQAZ",
    "suggestedAccountName": "Asset Living (Atlanta North)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTyOlAAK",
    "contactName": "Maria Ortega",
    "contactEmail": "axiom@firstcommunities.com",
    "suggestedAccountId": "0012A00002D1kUOQAZ",
    "suggestedAccountName": "Asset Living (Atlanta North)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPyGAAW",
    "contactName": "Lauren Scott",
    "contactEmail": "centuryplantationpointe@firstcommunities.com",
    "suggestedAccountId": "0012A00002D1kUOQAZ",
    "suggestedAccountName": "Asset Living (Atlanta North)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTsS2AAK",
    "contactName": "Amy .",
    "contactEmail": "theboundary@firstcommunities.com",
    "suggestedAccountId": "0012A00002D1kUOQAZ",
    "suggestedAccountName": "Asset Living (Atlanta North)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTnaqAAC",
    "contactName": "Mia Stafford",
    "contactEmail": "trellis@firstcommunities.com",
    "suggestedAccountId": "0012A00002D1kUOQAZ",
    "suggestedAccountName": "Asset Living (Atlanta North)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUEKQAA4",
    "contactName": "Shae Cunningham",
    "contactEmail": "4thstreet@ambling.com",
    "suggestedAccountId": "0013j00003Hk08lAAB",
    "suggestedAccountName": "Ambling Management Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUJH2AAO",
    "contactName": "Ruth Tywon",
    "contactEmail": "ameadows@ambling.com",
    "suggestedAccountId": "0013j00003Hk08lAAB",
    "suggestedAccountName": "Ambling Management Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUBdIAAW",
    "contactName": "Jennifer McFarland",
    "contactEmail": "apark@ambling.com",
    "suggestedAccountId": "0013j00003Hk08lAAB",
    "suggestedAccountName": "Ambling Management Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gToXbAAK",
    "contactName": "Toni Mayes",
    "contactEmail": "avalonapm@ambling.com",
    "suggestedAccountId": "0013j00003Hk08lAAB",
    "suggestedAccountName": "Ambling Management Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0hhAAC",
    "contactName": "Holly Rosser",
    "contactEmail": "palmettopreservemgr@ambling.com",
    "suggestedAccountId": "0013j00003Hk08lAAB",
    "suggestedAccountName": "Ambling Management Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvJSAA0",
    "contactName": "Chad Isbell",
    "contactEmail": "906la1@hanoverco.com",
    "suggestedAccountId": "0012A000029mVk0QAE",
    "suggestedAccountName": "Hanover Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzqrAAC",
    "contactName": "Thomas Talarico",
    "contactEmail": "930nomo@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrbsAAC",
    "contactName": "Kayla Longoria",
    "contactEmail": "caitlin.batten@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTntdAAC",
    "contactName": "Erik Rowan",
    "contactEmail": "campusheights@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxb6AAC",
    "contactName": "Beth Reyes",
    "contactEmail": "centuryplaza@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTtd5AAC",
    "contactName": "Felipe Rodriguez",
    "contactEmail": "felipe.rodriguez@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTtMBAA0",
    "contactName": "Kelsey Martin",
    "contactEmail": "grove.auburn@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00002OELgxAAH",
    "contactName": "Jerry Martinez",
    "contactEmail": "jerry.martinez@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrvGAAS",
    "contactName": "Devon Kopriva",
    "contactEmail": "junction@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTyzBAAS",
    "contactName": "Maria Perez",
    "contactEmail": "lakeviewkilleen@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTv6aAAC",
    "contactName": "Halle Johnston",
    "contactEmail": "loftsatwolfpen@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPUGAA4",
    "contactName": "Melanie Long",
    "contactEmail": "melanie.long@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUEJCAA4",
    "contactName": "Zac .",
    "contactEmail": "overlookclarksville@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUEbuAAG",
    "contactName": "Charla Shipman",
    "contactEmail": "pointeattroy@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTs6EAAS",
    "contactName": "Jenna Trujillo",
    "contactEmail": "postonnord@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003vy6xXAAQ",
    "contactName": "Richard Hysell",
    "contactEmail": "richard.hysell@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUJwcAAG",
    "contactName": "Sarina Casarez",
    "contactEmail": "riveroaks@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxQzAAK",
    "contactName": "Garrett .",
    "contactEmail": "stadiumsuites@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUBDJAA4",
    "contactName": "Jonas Augustine",
    "contactEmail": "stadiumviewar@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvhWAAS",
    "contactName": "Raquel Anderson",
    "contactEmail": "sungate@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpNiAAK",
    "contactName": "Teresa Moffitt",
    "contactEmail": "teresa.moffitt@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvl6AAC",
    "contactName": "Erika Barnes",
    "contactEmail": "thecrown@assetliving.com",
    "suggestedAccountId": "0012A00002D1lsbQAB",
    "suggestedAccountName": "Asset Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003Dsx8vAAB",
    "contactName": "Amal Ali",
    "contactEmail": "aali@vestacorp.com",
    "suggestedAccountId": "001F000001fe44KIAQ",
    "suggestedAccountName": "Vesta Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AGqrAAG",
    "contactName": "Amber Allison",
    "contactEmail": "aallison@brooksideproperties.com",
    "suggestedAccountId": "0012A000024J9fXQAS",
    "suggestedAccountName": "Brookside Properties, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTo5EAAS",
    "contactName": "Jen O'Brien",
    "contactEmail": "countryvillage@brooksideproperties.com",
    "suggestedAccountId": "0012A000024J9fXQAS",
    "suggestedAccountName": "Brookside Properties, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTu6lAAC",
    "contactName": "Tonya Easly",
    "contactEmail": "croleycourt@brooksideproperties.com",
    "suggestedAccountId": "0012A000024J9fXQAS",
    "suggestedAccountName": "Brookside Properties, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0ZZAA0",
    "contactName": "Michelle Demos",
    "contactEmail": "kensingtonstation@brooksideproperties.com",
    "suggestedAccountId": "0012A000024J9fXQAS",
    "suggestedAccountName": "Brookside Properties, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTtC9AAK",
    "contactName": "Jordan Barrows",
    "contactEmail": "mgralden@brooksideproperties.com",
    "suggestedAccountId": "0012A000024J9fXQAS",
    "suggestedAccountName": "Brookside Properties, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTs58AAC",
    "contactName": "Cathrine Wilburn",
    "contactEmail": "mgrhendrix@brooksideproperties.com",
    "suggestedAccountId": "0012A000024J9fXQAS",
    "suggestedAccountName": "Brookside Properties, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqoBAAS",
    "contactName": "Stacey Ladd",
    "contactEmail": "thegrandindianlake@brooksideproperties.com",
    "suggestedAccountId": "0012A000024J9fXQAS",
    "suggestedAccountName": "Brookside Properties, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEn0AAG",
    "contactName": "Aaron Dauber",
    "contactEmail": "aaron@integraaffordable.com",
    "suggestedAccountId": "0013j00002zjLL4AAM",
    "suggestedAccountName": "Integra Affordable Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU04BAAS",
    "contactName": "Jennifer .",
    "contactEmail": "abbott@jonesstreetresidential.com",
    "suggestedAccountId": "0013j00001tKtBLAA0",
    "suggestedAccountName": "Jones Street Residential, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTwajAAC",
    "contactName": "Amy Bundy",
    "contactEmail": "abundy@zrsmanagement.com",
    "suggestedAccountId": "0012A000026Ug77QAC",
    "suggestedAccountName": "ZRS Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUOzHAAW",
    "contactName": "Ehsan Claiborne",
    "contactEmail": "eclaiborne@zrsmanagement.com",
    "suggestedAccountId": "0012A000026Ug77QAC",
    "suggestedAccountName": "ZRS Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzQrAAK",
    "contactName": "Jacob Truax",
    "contactEmail": "hazelsouthpark@zrsmanagement.com",
    "suggestedAccountId": "0012A000026Ug77QAC",
    "suggestedAccountName": "ZRS Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUBdMAAW",
    "contactName": "Erica Martinez",
    "contactEmail": "jmartinez@zrsmanagement.com",
    "suggestedAccountId": "0012A000026Ug77QAC",
    "suggestedAccountName": "ZRS Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPt5AAG",
    "contactName": "Ann .",
    "contactEmail": "magnoliafalls@zrsmanagement.com",
    "suggestedAccountId": "0012A000026Ug77QAC",
    "suggestedAccountName": "ZRS Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqUfAAK",
    "contactName": "Jeniffer Flores",
    "contactEmail": "mosaicmtc@zrsmanagement.com",
    "suggestedAccountId": "0012A000026Ug77QAC",
    "suggestedAccountName": "ZRS Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003FeicGAAR",
    "contactName": "Nicholas Montalbano",
    "contactEmail": "ncm@zrsmanagement.com",
    "suggestedAccountId": "0012A000026Ug77QAC",
    "suggestedAccountName": "ZRS Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqWWAA0",
    "contactName": "Krystie Radford",
    "contactEmail": "sugarloaf@zrsmanagement.com",
    "suggestedAccountId": "0012A000026Ug77QAC",
    "suggestedAccountName": "ZRS Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzaaAAC",
    "contactName": "Kevin Billings",
    "contactEmail": "thebeacon@zrsmanagement.com",
    "suggestedAccountId": "0012A000026Ug77QAC",
    "suggestedAccountName": "ZRS Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUKYmAAO",
    "contactName": "Shaun Smith",
    "contactEmail": "veridian@zrsmanagement.com",
    "suggestedAccountId": "0012A000026Ug77QAC",
    "suggestedAccountName": "ZRS Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHL1AAO",
    "contactName": "Andrea Marmet",
    "contactEmail": "achrysler@solomonorg.com",
    "suggestedAccountId": "0012A00002AOFkEQAX",
    "suggestedAccountName": "Solomon Organization, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHLBAA4",
    "contactName": "Dan Phillips",
    "contactEmail": "dphillips@solomonorg.com",
    "suggestedAccountId": "0012A00002AOFkEQAX",
    "suggestedAccountName": "Solomon Organization, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHKrAAO",
    "contactName": "Jordan Gaffney",
    "contactEmail": "jgaffney@solomonorg.com",
    "suggestedAccountId": "0012A00002AOFkEQAX",
    "suggestedAccountName": "Solomon Organization, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHKwAAO",
    "contactName": "Katelynn Madigan",
    "contactEmail": "kmadigan@solomonorg.com",
    "suggestedAccountId": "0012A00002AOFkEQAX",
    "suggestedAccountName": "Solomon Organization, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHDNAA4",
    "contactName": "Russell Achatz",
    "contactEmail": "rachatz@solomonorg.com",
    "suggestedAccountId": "0012A00002AOFkEQAX",
    "suggestedAccountName": "Solomon Organization, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHKhAAO",
    "contactName": "Sharyn Kilpatrick",
    "contactEmail": "skilpatrick@solomonorg.com",
    "suggestedAccountId": "0012A00002AOFkEQAX",
    "suggestedAccountName": "Solomon Organization, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTtMsAAK",
    "contactName": "Anique Dunn",
    "contactEmail": "adunn@liveatlantic.com",
    "suggestedAccountId": "0013j000034G6xTAAS",
    "suggestedAccountName": "Atlantic Realty Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrd8AAC",
    "contactName": "Shaina Fields",
    "contactEmail": "northwestth@liveatlantic.com",
    "suggestedAccountId": "0013j000034G6xTAAS",
    "suggestedAccountName": "Atlantic Realty Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTsz4AAC",
    "contactName": "Sabrina Richards",
    "contactEmail": "srichards@liveatlantic.com",
    "suggestedAccountId": "0013j000034G6xTAAS",
    "suggestedAccountName": "Atlantic Realty Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUOyvAAG",
    "contactName": "Anjye Herrera-Bryant",
    "contactEmail": "villageatjonesfalls@liveatlantic.com",
    "suggestedAccountId": "0013j000034G6xTAAS",
    "suggestedAccountName": "Atlantic Realty Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzZtAAK",
    "contactName": "Aracelis Feliciano",
    "contactEmail": "afeliciano@cornerstonecorporation.net",
    "suggestedAccountId": "0013j000039cHPEAA2",
    "suggestedAccountName": "Cornerstone Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTwymAAC",
    "contactName": "Jeanne Shelton",
    "contactEmail": "jshelton@cornerstonecorporation.net",
    "suggestedAccountId": "0013j000039cHPEAA2",
    "suggestedAccountName": "Cornerstone Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHeSAAW",
    "contactName": "Andrew Ferrans",
    "contactEmail": "aferrans@villagegreen.com",
    "suggestedAccountId": "001F0000012O99cIAC",
    "suggestedAccountName": "Village Green Property Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxxvAAC",
    "contactName": "Charlie Shaw",
    "contactEmail": "flb@villagegreen.com",
    "suggestedAccountId": "001F0000012O99cIAC",
    "suggestedAccountName": "Village Green Property Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHduAAG",
    "contactName": "Jessica Fett",
    "contactEmail": "jfett@villagegreen.com",
    "suggestedAccountId": "001F0000012O99cIAC",
    "suggestedAccountName": "Village Green Property Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHeXAAW",
    "contactName": "Joseph Stilwell",
    "contactEmail": "jstilwell@villagegreen.com",
    "suggestedAccountId": "001F0000012O99cIAC",
    "suggestedAccountName": "Village Green Property Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHgiAAG",
    "contactName": "Becky Mohan",
    "contactEmail": "rmohan@villagegreen.com",
    "suggestedAccountId": "001F0000012O99cIAC",
    "suggestedAccountName": "Village Green Property Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003OOBxyAAH",
    "contactName": "Sandy Garrett",
    "contactEmail": "sgarrett@villagegreen.com",
    "suggestedAccountId": "001F0000012O99cIAC",
    "suggestedAccountName": "Village Green Property Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHfBAAW",
    "contactName": "Samantha Ivey",
    "contactEmail": "sivey@villagegreen.com",
    "suggestedAccountId": "001F0000012O99cIAC",
    "suggestedAccountName": "Village Green Property Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHZdAAO",
    "contactName": "Taryne  Dixon Dixon",
    "contactEmail": "tdixon@villagegreen.com",
    "suggestedAccountId": "001F0000012O99cIAC",
    "suggestedAccountName": "Village Green Property Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxx4AAC",
    "contactName": "Justine Smith",
    "contactEmail": "agavefalls@ticommunities.com",
    "suggestedAccountId": "0013j00002bqb9tAAA",
    "suggestedAccountName": "TI Communities",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTyQuAAK",
    "contactName": "Tarshera .",
    "contactEmail": "regencypointe@ticommunities.com",
    "suggestedAccountId": "0013j00002bqb9tAAA",
    "suggestedAccountName": "TI Communities",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUB7uAAG",
    "contactName": "Tiara Lively",
    "contactEmail": "southridge@ticommunities.com",
    "suggestedAccountId": "0013j00002bqb9tAAA",
    "suggestedAccountName": "TI Communities",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEUIAA4",
    "contactName": "Amy Haug",
    "contactEmail": "ahaug@cardon.us",
    "suggestedAccountId": "0012A00002D1kggQAB",
    "suggestedAccountName": "CarDon & Associates (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEUSAA4",
    "contactName": "Daniel Moore",
    "contactEmail": "dmoore@cardon.us",
    "suggestedAccountId": "0012A00002D1kggQAB",
    "suggestedAccountName": "CarDon & Associates (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEQMAA4",
    "contactName": "Eric McIntosh",
    "contactEmail": "emcintosh@cardon.us",
    "suggestedAccountId": "0012A00002D1kggQAB",
    "suggestedAccountName": "CarDon & Associates (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AETGAA4",
    "contactName": "Angie Hoye",
    "contactEmail": "ahoye@monarchmanagement.biz",
    "suggestedAccountId": "0012A00002D1khWQAR",
    "suggestedAccountName": "Monarch Management & Realty (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxJ0AAK",
    "contactName": "Theresa .",
    "contactEmail": "akramer@charterpropertygroup.com",
    "suggestedAccountId": "0012A0000219rnVQAQ",
    "suggestedAccountName": "Charter Property Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUQ8xAAG",
    "contactName": "Angie Edelsberg",
    "contactEmail": "albanycommons1@liveoakwood.com",
    "suggestedAccountId": "0013j000039cHsYAAU",
    "suggestedAccountName": "Oakwood Management Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUQHWAA4",
    "contactName": "Jenni White",
    "contactEmail": "albanywoods@liveoakwood.com",
    "suggestedAccountId": "0013j000039cHsYAAU",
    "suggestedAccountName": "Oakwood Management Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUBKEAA4",
    "contactName": "Tammy Miller",
    "contactEmail": "cabotcove@liveoakwood.com",
    "suggestedAccountId": "0013j000039cHsYAAU",
    "suggestedAccountName": "Oakwood Management Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTncGAAS",
    "contactName": "Jamie Marquart",
    "contactEmail": "newbridgecommons@liveoakwood.com",
    "suggestedAccountId": "0013j000039cHsYAAU",
    "suggestedAccountName": "Oakwood Management Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gToHLAA0",
    "contactName": "Aaron Conley",
    "contactEmail": "oak853a@liveoakwood.com",
    "suggestedAccountId": "0013j000039cHsYAAU",
    "suggestedAccountName": "Oakwood Management Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUOrHAAW",
    "contactName": "Matthew Starrett",
    "contactEmail": "oak984@liveoakwood.com",
    "suggestedAccountId": "0013j000039cHsYAAU",
    "suggestedAccountName": "Oakwood Management Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvmpAAC",
    "contactName": "Crystal Brown",
    "contactEmail": "oak985@liveoakwood.com",
    "suggestedAccountId": "0013j000039cHsYAAU",
    "suggestedAccountName": "Oakwood Management Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTyruAAC",
    "contactName": "Candy Pritchard",
    "contactEmail": "polarisplace@liveoakwood.com",
    "suggestedAccountId": "0013j000039cHsYAAU",
    "suggestedAccountName": "Oakwood Management Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTt6mAAC",
    "contactName": "Caitlin Barga",
    "contactEmail": "riverandrich@liveoakwood.com",
    "suggestedAccountId": "0013j000039cHsYAAU",
    "suggestedAccountName": "Oakwood Management Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTx7mAAC",
    "contactName": "Steve Shy",
    "contactEmail": "sanctuaryvillage@liveoakwood.com",
    "suggestedAccountId": "0013j000039cHsYAAU",
    "suggestedAccountName": "Oakwood Management Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUOZ6AAO",
    "contactName": "Christine Evans",
    "contactEmail": "slateridge@liveoakwood.com",
    "suggestedAccountId": "0013j000039cHsYAAU",
    "suggestedAccountName": "Oakwood Management Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqtAAAS",
    "contactName": "Olivia Blind",
    "contactEmail": "thewendell@liveoakwood.com",
    "suggestedAccountId": "0013j000039cHsYAAU",
    "suggestedAccountName": "Oakwood Management Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTtp8AAC",
    "contactName": "Alexis Nance",
    "contactEmail": "alexis.n@woodpartners.com",
    "suggestedAccountId": "0013j00002dMkb6AAC",
    "suggestedAccountName": "Wood Partners (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002a2cmzQAA",
    "contactName": "John Martinez",
    "contactEmail": "allrid@shared.westdale.com",
    "suggestedAccountId": "0012A00002D1lvRQAR",
    "suggestedAccountName": "Westdale Asset Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzboAAC",
    "contactName": "Scott Reynolds",
    "contactEmail": "crs@shared.westdale.com",
    "suggestedAccountId": "0012A00002D1lvRQAR",
    "suggestedAccountName": "Westdale Asset Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxmlAAC",
    "contactName": "Andrew Frontis",
    "contactEmail": "dav@shared.westdale.com",
    "suggestedAccountId": "0012A00002D1lvRQAR",
    "suggestedAccountName": "Westdale Asset Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUIuTAAW",
    "contactName": "Andrea Sorrentino",
    "contactEmail": "gbr@westdale.com",
    "suggestedAccountId": "0012A00002D1lvRQAR",
    "suggestedAccountName": "Westdale Asset Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzfvAAC",
    "contactName": "Marisol Grier",
    "contactEmail": "mvs2@shared.westdale.com",
    "suggestedAccountId": "0012A00002D1lvRQAR",
    "suggestedAccountName": "Westdale Asset Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTuwHAAS",
    "contactName": "Sheila Davenport",
    "contactEmail": "qcg@westdale.com",
    "suggestedAccountId": "0012A00002D1lvRQAR",
    "suggestedAccountName": "Westdale Asset Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUJ4fAAG",
    "contactName": "Krystal Rohena",
    "contactEmail": "alterra@continentalproperties.com",
    "suggestedAccountId": "0012A00002D1lLRQAZ",
    "suggestedAccountName": "Continental Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHGGAA4",
    "contactName": "Alexis Sloan",
    "contactEmail": "alturaspasorobles@trinity-pm.com",
    "suggestedAccountId": "0012A00002D1jzBQAR",
    "suggestedAccountName": "Trinity Property Consultants",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHJAAA4",
    "contactName": "Michael Luna",
    "contactEmail": "arrivebroadwaylofts@trinity-pm.com",
    "suggestedAccountId": "0012A00002D1jzBQAR",
    "suggestedAccountName": "Trinity Property Consultants",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH6GAAW",
    "contactName": "Peter San Nicolas",
    "contactEmail": "arriveloscarneros2@trinity-pm.com",
    "suggestedAccountId": "0012A00002D1jzBQAR",
    "suggestedAccountName": "Trinity Property Consultants",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHJ5AAO",
    "contactName": "Peter San Nicolas",
    "contactEmail": "loscarneros@trinity-pm.com",
    "suggestedAccountId": "0012A00002D1jzBQAR",
    "suggestedAccountName": "Trinity Property Consultants",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH7JAAW",
    "contactName": "Marissa Padilla",
    "contactEmail": "missionvalley@trinity-pm.com",
    "suggestedAccountId": "0012A00002D1jzBQAR",
    "suggestedAccountName": "Trinity Property Consultants",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AGpQAAW",
    "contactName": "Brittany Henderson",
    "contactEmail": "renew4247@trinity-pm.com",
    "suggestedAccountId": "0012A00002D1jzBQAR",
    "suggestedAccountName": "Trinity Property Consultants",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH6aAAG",
    "contactName": "Alethea Acasio",
    "contactEmail": "renewalpine@trinity-pm.com",
    "suggestedAccountId": "0012A00002D1jzBQAR",
    "suggestedAccountName": "Trinity Property Consultants",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH5JAAW",
    "contactName": "Amber Jaime",
    "contactEmail": "renewaster@trinity-pm.com",
    "suggestedAccountId": "0012A00002D1jzBQAR",
    "suggestedAccountName": "Trinity Property Consultants",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH1IAAW",
    "contactName": "Jennifer Bump",
    "contactEmail": "renewoncoloma@trinity-pm.com",
    "suggestedAccountId": "0012A00002D1jzBQAR",
    "suggestedAccountName": "Trinity Property Consultants",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHBVAA4",
    "contactName": "Allison Scott",
    "contactEmail": "renewparkblu@trinity-pm.com",
    "suggestedAccountId": "0012A00002D1jzBQAR",
    "suggestedAccountName": "Trinity Property Consultants",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHC4AAO",
    "contactName": "Allison Scott",
    "contactEmail": "renewparkviva@trinity-pm.com",
    "suggestedAccountId": "0012A00002D1jzBQAR",
    "suggestedAccountName": "Trinity Property Consultants",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHDlAAO",
    "contactName": "Alethea Acasio",
    "contactEmail": "renewsummit@trinity-pm.com",
    "suggestedAccountId": "0012A00002D1jzBQAR",
    "suggestedAccountName": "Trinity Property Consultants",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEZIAA4",
    "contactName": "Alyssa Kreitl",
    "contactEmail": "alyssa@thecampusedge.com",
    "suggestedAccountId": "0012A00002D1kejQAB",
    "suggestedAccountName": "Campus Edge (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hEKQAY",
    "contactName": "Alyssa Fabiani",
    "contactEmail": "alyssaf@pmcpropertygroup.com",
    "suggestedAccountId": "001F000001GXHTaIAP",
    "suggestedAccountName": "PMC Property Group, Inc (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxX2AAK",
    "contactName": "Amanda Green",
    "contactEmail": "amanda@f8properties.com",
    "suggestedAccountId": "0012A00002D1qPOQAZ",
    "suggestedAccountName": "Figure Eight Properties - Regional - HOU",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPcLAAW",
    "contactName": "Shun .",
    "contactEmail": "amberleyhouse@cmcproperties.com",
    "suggestedAccountId": "001F000001WXoiCIAT",
    "suggestedAccountName": "CMC Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041A9fLAAS",
    "contactName": "Amy Milford",
    "contactEmail": "amilford@howgroup.com",
    "suggestedAccountId": "0012A00002AM0u7QAD",
    "suggestedAccountName": "How Properties, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEQqAAO",
    "contactName": "Amy Call",
    "contactEmail": "amy.call@lacasainc.net",
    "suggestedAccountId": "0012A00002D1kfEQAR",
    "suggestedAccountName": "LaCasa, Inc (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003YKF3BAAX",
    "contactName": "Amy Sexton Horsley",
    "contactEmail": "amyhorsley@cyruspropertymanagement.com",
    "suggestedAccountId": "0012A00002D1m8CQAR",
    "suggestedAccountName": "Cyrus Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002azpUeQAI",
    "contactName": "Andy Karam",
    "contactEmail": "andy@carydale.com",
    "suggestedAccountId": "0012A00002D1mAOQAZ",
    "suggestedAccountName": "Carydale Enterprises (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AICWAA4",
    "contactName": "Angie Sheddan",
    "contactEmail": "angie.sheddan@envolvellc.com",
    "suggestedAccountId": "0013j00002dMYopAAG",
    "suggestedAccountName": "Envolve Communities, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUKEKAA4",
    "contactName": "Stefanie Neaves",
    "contactEmail": "countryplacemgr@envolvellc.com",
    "suggestedAccountId": "0013j00002dMYopAAG",
    "suggestedAccountName": "Envolve Communities, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gToWjAAK",
    "contactName": "Alyssa .",
    "contactEmail": "hallmarkatcolumbia@envolvellc.com",
    "suggestedAccountId": "0013j00002dMYopAAG",
    "suggestedAccountName": "Envolve Communities, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTyssAAC",
    "contactName": "Charmaine Chavis",
    "contactEmail": "millrivercrossingmgr@envolvellc.com",
    "suggestedAccountId": "0013j00002dMYopAAG",
    "suggestedAccountName": "Envolve Communities, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTy9sAAC",
    "contactName": "Heather Pauly-Swartzbaugh",
    "contactEmail": "redhillsvillas@envolvellc.com",
    "suggestedAccountId": "0013j00002dMYopAAG",
    "suggestedAccountName": "Envolve Communities, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzwRAAS",
    "contactName": "Samantha Fedd",
    "contactEmail": "rosewoodestatesmgr@envolvellc.com",
    "suggestedAccountId": "0013j00002dMYopAAG",
    "suggestedAccountName": "Envolve Communities, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AICvAAO",
    "contactName": "Toya McCraw",
    "contactEmail": "toya.mccraw@envolvellc.com",
    "suggestedAccountId": "0013j00002dMYopAAG",
    "suggestedAccountName": "Envolve Communities, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AESvAAO",
    "contactName": "Anthony Ardizzone",
    "contactEmail": "anthony.ardizzone@tag-living.com",
    "suggestedAccountId": "0012A00002D1khqQAB",
    "suggestedAccountName": "Ardizzone Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AET5AAO",
    "contactName": "Tony Ardizzone",
    "contactEmail": "tony.ardizzone@tag-living.com",
    "suggestedAccountId": "0012A00002D1khqQAB",
    "suggestedAccountName": "Ardizzone Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003OOPtDAAX",
    "contactName": "Aarushi Poddar",
    "contactEmail": "apoddar@bmcproperties.com",
    "suggestedAccountId": "0012A00002D1kKQQAZ",
    "suggestedAccountName": "Bernstein Management Corporation",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHdeAAG",
    "contactName": "Aprill Brandt",
    "contactEmail": "aprill_brandt@edwardrose.com",
    "suggestedAccountId": "0012A00002D1kvgQAB",
    "suggestedAccountName": "Edward Rose & Sons (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHdtAAG",
    "contactName": "Becki Patino",
    "contactEmail": "becki.patino@edwardrose.com",
    "suggestedAccountId": "0012A00002D1kvgQAB",
    "suggestedAccountName": "Edward Rose & Sons (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHe8AAG",
    "contactName": "Emily Meier",
    "contactEmail": "emily_meier@edwardrose.com",
    "suggestedAccountId": "0012A00002D1kvgQAB",
    "suggestedAccountName": "Edward Rose & Sons (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHeNAAW",
    "contactName": "Erin Catanzarite",
    "contactEmail": "erin_catanzarite@edwardrose.com",
    "suggestedAccountId": "0012A00002D1kvgQAB",
    "suggestedAccountName": "Edward Rose & Sons (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHehAAG",
    "contactName": "Jeff Alkire",
    "contactEmail": "jeff_alkire@edwardrose.com",
    "suggestedAccountId": "0012A00002D1kvgQAB",
    "suggestedAccountName": "Edward Rose & Sons (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHewAAG",
    "contactName": "Joan Morehead",
    "contactEmail": "joan_morehead@edwardrose.com",
    "suggestedAccountId": "0012A00002D1kvgQAB",
    "suggestedAccountName": "Edward Rose & Sons (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHf1AAG",
    "contactName": "Jolene Mason",
    "contactEmail": "jolene_mason@edwardrose.com",
    "suggestedAccountId": "0012A00002D1kvgQAB",
    "suggestedAccountName": "Edward Rose & Sons (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHfaAAG",
    "contactName": "Kristin Vallie",
    "contactEmail": "kristin_vallie@edwardrose.com",
    "suggestedAccountId": "0012A00002D1kvgQAB",
    "suggestedAccountName": "Edward Rose & Sons (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHfVAAW",
    "contactName": "Lauren Malson",
    "contactEmail": "lauren_malson@edwardrose.com",
    "suggestedAccountId": "0012A00002D1kvgQAB",
    "suggestedAccountName": "Edward Rose & Sons (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHexAAG",
    "contactName": "Samantha Mann",
    "contactEmail": "samantha_mann@edwardrose.com",
    "suggestedAccountId": "0012A00002D1kvgQAB",
    "suggestedAccountName": "Edward Rose & Sons (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHffAAG",
    "contactName": "William Merkel",
    "contactEmail": "william_merkel@edwardrose.com",
    "suggestedAccountId": "0012A00002D1kvgQAB",
    "suggestedAccountName": "Edward Rose & Sons (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTt1VAAS",
    "contactName": "Hannah Bello",
    "contactEmail": "arbors@ackermanngroup.com",
    "suggestedAccountId": "0012A00002D1lSiQAJ",
    "suggestedAccountName": "Ackermann Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPA8AAO",
    "contactName": "Jennifer Taggart",
    "contactEmail": "crosspoint@ackermanngroup.com",
    "suggestedAccountId": "0012A00002D1lSiQAJ",
    "suggestedAccountName": "Ackermann Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTohyAAC",
    "contactName": "Christie Boyd",
    "contactEmail": "arringtonestates@ledic.com",
    "suggestedAccountId": "001Rh00000KznjuIAB",
    "suggestedAccountName": "LEDIC Realty Company",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTtfXAAS",
    "contactName": "Celena Glover",
    "contactEmail": "foresthillpark@ledic.com",
    "suggestedAccountId": "001Rh00000KznjuIAB",
    "suggestedAccountName": "LEDIC Realty Company",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gToTIAA0",
    "contactName": "Diane Leach",
    "contactEmail": "meadowviewestates@ledic.com",
    "suggestedAccountId": "001Rh00000KznjuIAB",
    "suggestedAccountName": "LEDIC Realty Company",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqKxAAK",
    "contactName": "Janine Livingston",
    "contactEmail": "stewartstream@ledic.com",
    "suggestedAccountId": "001Rh00000KznjuIAB",
    "suggestedAccountName": "LEDIC Realty Company",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003OQhDUAA1",
    "contactName": "Gwynn Palace",
    "contactEmail": "ashea@laramar.com",
    "suggestedAccountId": "0012A00002D1kIEQAZ",
    "suggestedAccountName": "Laramar Group LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrWRAA0",
    "contactName": "Roderick .",
    "contactEmail": "ashfordplace@bridgepm.com",
    "suggestedAccountId": "0012A00002D1m8lQAB",
    "suggestedAccountName": "Bridge Property Management (Salt Lake City)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzVLAA0",
    "contactName": "Makeeya Perkins",
    "contactEmail": "mperkins@bridgepm.com",
    "suggestedAccountId": "0012A00002D1m8lQAB",
    "suggestedAccountName": "Bridge Property Management (Salt Lake City)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTkV9AAK",
    "contactName": "Ashley Shelite",
    "contactEmail": "ashley.shelite@indiomgmt.com",
    "suggestedAccountId": "0012A00002D1m7hQAB",
    "suggestedAccountName": "Indio Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxysAAC",
    "contactName": "Alicia Holman",
    "contactEmail": "ashleyarms@shpmanagement.com",
    "suggestedAccountId": "0012A00002D1kpLQAR",
    "suggestedAccountName": "SHP Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqUOAA0",
    "contactName": "Ashley Perillo",
    "contactEmail": "ashleyperillo@towneproperties.com",
    "suggestedAccountId": "001F000001WXoi0IAD",
    "suggestedAccountName": "Towne Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrKoAAK",
    "contactName": "Charity Vann",
    "contactEmail": "charityvann@towneproperties.com",
    "suggestedAccountId": "001F000001WXoi0IAD",
    "suggestedAccountName": "Towne Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTow7AAC",
    "contactName": "Bridget Everett",
    "contactEmail": "cincinnatipremier@towneproperties.com",
    "suggestedAccountId": "001F000001WXoi0IAD",
    "suggestedAccountName": "Towne Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTsdoAAC",
    "contactName": "Gene Whittington",
    "contactEmail": "cynthiameyer@towneproperties.com",
    "suggestedAccountId": "001F000001WXoi0IAD",
    "suggestedAccountName": "Towne Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPwhAAG",
    "contactName": "Johannah Carpenter",
    "contactEmail": "johannahcarpenter@towneproperties.com",
    "suggestedAccountId": "001F000001WXoi0IAD",
    "suggestedAccountName": "Towne Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTtqSAAS",
    "contactName": "Wendy Rock",
    "contactEmail": "wrights@towneproperties.com",
    "suggestedAccountId": "001F000001WXoi0IAD",
    "suggestedAccountName": "Towne Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTuPbAAK",
    "contactName": "Donna Turner",
    "contactEmail": "ashtabulatowers@forestcity.net",
    "suggestedAccountId": "0012A00002D1lXxQAJ",
    "suggestedAccountName": "Brookfield Properties Multifamily (Cleveland)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpYvAAK",
    "contactName": "Cathy Hughes",
    "contactEmail": "buckeyetowers@forestcity.net",
    "suggestedAccountId": "0012A00002D1lXxQAJ",
    "suggestedAccountName": "Brookfield Properties Multifamily (Cleveland)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTwg1AAC",
    "contactName": "Jennifer Lopez",
    "contactEmail": "ashtonmgr@jnbplatinum.com",
    "suggestedAccountId": "0012A00002D1lpdQAB",
    "suggestedAccountName": "JNB Platinum (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPUlAAO",
    "contactName": "Stella Jimenez",
    "contactEmail": "aspenpointeleasing@jamcoproperties.com",
    "suggestedAccountId": "0012A00002D1kWlQAJ",
    "suggestedAccountName": "Jamco Properties",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPUaAAO",
    "contactName": "Angela Harris",
    "contactEmail": "emeraldpointe@jamcoproperties.com",
    "suggestedAccountId": "0012A00002D1kWlQAJ",
    "suggestedAccountName": "Jamco Properties",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUB7NAAW",
    "contactName": "Sheila Hogan",
    "contactEmail": "lakeside@jamcoproperties.com",
    "suggestedAccountId": "0012A00002D1kWlQAJ",
    "suggestedAccountName": "Jamco Properties",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0fIAAS",
    "contactName": "Oscar Gutierrez",
    "contactEmail": "lindenridgeleasing@jamcoproperties.com",
    "suggestedAccountId": "0012A00002D1kWlQAJ",
    "suggestedAccountName": "Jamco Properties",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzUCAA0",
    "contactName": "LaToya Buchanan",
    "contactEmail": "maplewoodpointeleasing@jamcoproperties.com",
    "suggestedAccountId": "0012A00002D1kWlQAJ",
    "suggestedAccountName": "Jamco Properties",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxFoAAK",
    "contactName": "Angela James",
    "contactEmail": "stonetreeleasing@jamcoproperties.com",
    "suggestedAccountId": "0012A00002D1kWlQAJ",
    "suggestedAccountName": "Jamco Properties",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTnV5AAK",
    "contactName": "Jessica Garcia",
    "contactEmail": "stratfordarms@jamcoproperties.com",
    "suggestedAccountId": "0012A00002D1kWlQAJ",
    "suggestedAccountName": "Jamco Properties",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTwP7AAK",
    "contactName": "Sandra Gomez",
    "contactEmail": "villageleasing@jamcoproperties.com",
    "suggestedAccountId": "0012A00002D1kWlQAJ",
    "suggestedAccountName": "Jamco Properties",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTnLKAA0",
    "contactName": "Eric Bumpers",
    "contactEmail": "willowlake@jamcoproperties.com",
    "suggestedAccountId": "0012A00002D1kWlQAJ",
    "suggestedAccountName": "Jamco Properties",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxu2AAC",
    "contactName": "Solene Wiley",
    "contactEmail": "woodsatsouthlake@jamcoproperties.com",
    "suggestedAccountId": "0012A00002D1kWlQAJ",
    "suggestedAccountName": "Jamco Properties",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003vwDyoAAE",
    "contactName": "Angie Taylor",
    "contactEmail": "ataylor@allegiant-carter.com",
    "suggestedAccountId": "0013j000031bhj6AAA",
    "suggestedAccountName": "Allegiant-Carter Management, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUJ4XAAW",
    "contactName": "Avona Terrell",
    "contactEmail": "aterrell@mercyhousing.org",
    "suggestedAccountId": "0012A00002D1kG9QAJ",
    "suggestedAccountName": "Mercy Housing  (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPudAAG",
    "contactName": "Laci Smith",
    "contactEmail": "atlanta@myaspenheights.com",
    "suggestedAccountId": "001F000001qoJ82IAE",
    "suggestedAccountName": "Aspen Heights - Springfield",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTtpAAAS",
    "contactName": "Morgan Ryan",
    "contactEmail": "charlotte@myaspenheights.com",
    "suggestedAccountId": "001F000001qoJ82IAE",
    "suggestedAccountName": "Aspen Heights - Springfield",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTplYAAS",
    "contactName": "Kendra Jones",
    "contactEmail": "towson@myaspenheights.com",
    "suggestedAccountId": "001F000001qoJ82IAE",
    "suggestedAccountName": "Aspen Heights - Springfield",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0J6AAK",
    "contactName": "Bertha Ross",
    "contactEmail": "autumncrest@boydmanagement.com",
    "suggestedAccountId": "001Rh00000Kzn18IAB",
    "suggestedAccountName": "Boyd Development",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0P0AAK",
    "contactName": "Trista Jenkins",
    "contactEmail": "meadowbrookvillage@boydmanagement.com",
    "suggestedAccountId": "001Rh00000Kzn18IAB",
    "suggestedAccountName": "Boyd Development",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrbzAAC",
    "contactName": "LaToya Funderburk",
    "contactEmail": "avant@alapts.com",
    "suggestedAccountId": "0013j00002bp7EYAAY",
    "suggestedAccountName": "American Landmark Apartments (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTyQQAA0",
    "contactName": "Eder Berber",
    "contactEmail": "bentley@alapts.com",
    "suggestedAccountId": "0013j00002bp7EYAAY",
    "suggestedAccountName": "American Landmark Apartments (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpg2AAC",
    "contactName": "Denise Fulton",
    "contactEmail": "presleyoaks@alapts.com",
    "suggestedAccountId": "0013j00002bp7EYAAY",
    "suggestedAccountName": "American Landmark Apartments (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUKZSAA4",
    "contactName": "Ariana Brasfield",
    "contactEmail": "thehamilton@alapts.com",
    "suggestedAccountId": "0013j00002bp7EYAAY",
    "suggestedAccountName": "American Landmark Apartments (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTuvoAAC",
    "contactName": "Haley Foxworth",
    "contactEmail": "theoxford@alapts.com",
    "suggestedAccountId": "0013j00002bp7EYAAY",
    "suggestedAccountName": "American Landmark Apartments (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEapAAG",
    "contactName": "Andrea Wolf",
    "contactEmail": "awolf@coreredevelopment.com",
    "suggestedAccountId": "0012A00002AM1IAQA1",
    "suggestedAccountName": "Core Redevelopment (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "003F000001grDT2IAM",
    "contactName": "Bel Oak",
    "contactEmail": "bel-oak@wi.rr.com",
    "suggestedAccountId": "0013j000039cJYkAAM",
    "suggestedAccountName": "Burkett Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTyG1AAK",
    "contactName": "Cindy Munn",
    "contactEmail": "charlespointeapts@sc.rr.com",
    "suggestedAccountId": "0013j000039cJYkAAM",
    "suggestedAccountName": "Burkett Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHFwAAO",
    "contactName": "Maria Duenas",
    "contactEmail": "bellamonte@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHGQAA4",
    "contactName": "Jessica Salinas",
    "contactEmail": "bettyann@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHBCAA4",
    "contactName": "Diana De Sales",
    "contactEmail": "blossomriver@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH6QAAW",
    "contactName": "Brittany Marquez",
    "contactEmail": "bmarquez@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH9PAAW",
    "contactName": "Romina Oribello",
    "contactEmail": "broadwaycove@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH9ZAAW",
    "contactName": "Anthony Maraujo",
    "contactEmail": "broadwaysd@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHDgAAO",
    "contactName": "Shavaun James",
    "contactEmail": "camara@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHHdAAO",
    "contactName": "Jake Moran",
    "contactEmail": "cedargroveapm@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH8lAAG",
    "contactName": "Lynn Newton",
    "contactEmail": "citycenterapts@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHHEAA4",
    "contactName": "Gabriela Lutz",
    "contactEmail": "cornerstone@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH9oAAG",
    "contactName": "Sara Toves",
    "contactEmail": "derosegardens@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHD2AAO",
    "contactName": "Kathy Kim",
    "contactEmail": "doria@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHGBAA4",
    "contactName": "Debera Barrett",
    "contactEmail": "dougford@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHFcAAO",
    "contactName": "Deborah Sanchez",
    "contactEmail": "dsanchez@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH8DAAW",
    "contactName": "Victor Ramirez",
    "contactEmail": "helzercourts@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHJFAA4",
    "contactName": "Lisa Litten",
    "contactEmail": "jscosb@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHFIAA4",
    "contactName": "Olga Corna",
    "contactEmail": "knollsapts@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHJZAA4",
    "contactName": "Nancy Neria",
    "contactEmail": "laurelgroveapts@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH8WAAW",
    "contactName": "Shafequah Archie",
    "contactEmail": "main@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH9UAAW",
    "contactName": "Marley Landes",
    "contactEmail": "mlandes@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH76AAG",
    "contactName": "Sandra Corona",
    "contactEmail": "morronegardens@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHGuAAO",
    "contactName": "Maria Valenzuela",
    "contactEmail": "mvalenzuela@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH7dAAG",
    "contactName": "Ebony Smith",
    "contactEmail": "oxford@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHFhAAO",
    "contactName": "Zenda Haney",
    "contactEmail": "parkplace@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH9AAAW",
    "contactName": "Marley Landes",
    "contactEmail": "pocoway@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHArAAO",
    "contactName": "Angelique Paige-McIntyre",
    "contactEmail": "puerto@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHATAA4",
    "contactName": "Danita Turner",
    "contactEmail": "rosadecastilla@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHCUAA4",
    "contactName": "Rachel Kelley",
    "contactEmail": "rosefield@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH7OAAW",
    "contactName": "Dan Stone",
    "contactEmail": "villages@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AH75AAG",
    "contactName": "Edith Ramirez",
    "contactEmail": "villaserena@jsco.net",
    "suggestedAccountId": "0012A00002D1qNWQAZ",
    "suggestedAccountName": "John Stewart Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTsiuAAC",
    "contactName": "Tanya Grena",
    "contactEmail": "belmonthouse@livepreferred.com",
    "suggestedAccountId": "0012A00002D1lX2QAJ",
    "suggestedAccountName": "Preferred Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTs4RAAS",
    "contactName": "Alexandra Ruegg",
    "contactEmail": "riverhousesales@livepreferred.com",
    "suggestedAccountId": "0012A00002D1lX2QAJ",
    "suggestedAccountName": "Preferred Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041A7kSAAS",
    "contactName": "Ben Voss",
    "contactEmail": "benjaminv@hawaiianprop.com",
    "suggestedAccountId": "0012A00002D1kXxQAJ",
    "suggestedAccountName": "Hawaiian Properties, Ltd. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0JNAA0",
    "contactName": "Katie Molinari",
    "contactEmail": "bennington@cambridgemsi.com",
    "suggestedAccountId": "001F000001GXHS9IAP",
    "suggestedAccountName": "Cambridge Management Services (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUBapAAG",
    "contactName": "Vanessa Funk",
    "contactEmail": "gvatmalta@cambridgemsi.com",
    "suggestedAccountId": "001F000001GXHS9IAP",
    "suggestedAccountName": "Cambridge Management Services (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrtLAAS",
    "contactName": "Donna Green",
    "contactEmail": "n-svillage@cambridgemsi.com",
    "suggestedAccountId": "001F000001GXHS9IAP",
    "suggestedAccountName": "Cambridge Management Services (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTscUAAS",
    "contactName": "Christina Boiardi",
    "contactEmail": "vue@cambridgemsi.com",
    "suggestedAccountId": "001F000001GXHS9IAP",
    "suggestedAccountName": "Cambridge Management Services (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041A7dRAAS",
    "contactName": "Brandy Glover",
    "contactEmail": "bglover@weigandomega.com",
    "suggestedAccountId": "0012A00002D1kkmQAB",
    "suggestedAccountName": "Weigand Omega Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEWdAAO",
    "contactName": "Bridget Hilts",
    "contactEmail": "bhilts@twgdev.com",
    "suggestedAccountId": "0012A00002D1ketQAB",
    "suggestedAccountName": "TWG Management, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEWeAAO",
    "contactName": "Dustin Detzler",
    "contactEmail": "ddetzler@twgdev.com",
    "suggestedAccountId": "0012A00002D1ketQAB",
    "suggestedAccountName": "TWG Management, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEZmAAO",
    "contactName": "Holly MacDougall",
    "contactEmail": "hneff@twgdev.com",
    "suggestedAccountId": "0012A00002D1ketQAB",
    "suggestedAccountName": "TWG Management, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEToAAO",
    "contactName": "Joel Henney",
    "contactEmail": "jhenney@twgdev.com",
    "suggestedAccountId": "0012A00002D1ketQAB",
    "suggestedAccountName": "TWG Management, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHdZAAW",
    "contactName": "Bill Wilson",
    "contactEmail": "bill.wilson@mckinley.com",
    "suggestedAccountId": "0013j00003Afi5UAAR",
    "suggestedAccountName": "McKinley Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003Feo6gAAB",
    "contactName": "Ben Ingalls",
    "contactEmail": "bingalls@broe.com",
    "suggestedAccountId": "0012A00002D1kGJQAZ",
    "suggestedAccountName": "Broe Real Estate Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTmvdAAC",
    "contactName": "Beverly Nimmo",
    "contactEmail": "bnimmo@mesamanagement.net",
    "suggestedAccountId": "0012A00002D1k66QAB",
    "suggestedAccountName": "Mesa Management, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU08OAAS",
    "contactName": "Ashley Vanderkolk",
    "contactEmail": "breakers@wingatecompanies.com",
    "suggestedAccountId": "001F000001fe43hIAA",
    "suggestedAccountName": "Wingate Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTn8NAAS",
    "contactName": "Sharon Wiggins",
    "contactEmail": "capitol@wingatecompanies.com",
    "suggestedAccountId": "001F000001fe43hIAA",
    "suggestedAccountName": "Wingate Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTuvhAAC",
    "contactName": "Natasha Basil",
    "contactEmail": "carletoneast@wingatecompanies.com",
    "suggestedAccountId": "001F000001fe43hIAA",
    "suggestedAccountName": "Wingate Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTv6kAAC",
    "contactName": "Delilah .",
    "contactEmail": "claflin@wingatecompanies.com",
    "suggestedAccountId": "001F000001fe43hIAA",
    "suggestedAccountName": "Wingate Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTtB2AAK",
    "contactName": "Keesha Rue",
    "contactEmail": "governorasstmgr@wingatecompanies.com",
    "suggestedAccountId": "001F000001fe43hIAA",
    "suggestedAccountName": "Wingate Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTwn0AAC",
    "contactName": "Matthew Dugan",
    "contactEmail": "mdugan@wingatecompanies.com",
    "suggestedAccountId": "001F000001fe43hIAA",
    "suggestedAccountName": "Wingate Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpxxAAC",
    "contactName": "Bonnie Senecal",
    "contactEmail": "millhouses@wingatecompanies.com",
    "suggestedAccountId": "001F000001fe43hIAA",
    "suggestedAccountName": "Wingate Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxd3AAC",
    "contactName": "Neilie Sequeira",
    "contactEmail": "oldmillglen@wingatecompanies.com",
    "suggestedAccountId": "001F000001fe43hIAA",
    "suggestedAccountName": "Wingate Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUBPxAAO",
    "contactName": "Susan .",
    "contactEmail": "peterborough@wingatecompanies.com",
    "suggestedAccountId": "001F000001fe43hIAA",
    "suggestedAccountName": "Wingate Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTsMrAAK",
    "contactName": "Ivette Trujillo",
    "contactEmail": "pleasantdale@wingatecompanies.com",
    "suggestedAccountId": "001F000001fe43hIAA",
    "suggestedAccountName": "Wingate Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUJMoAAO",
    "contactName": "Pam Welcome",
    "contactEmail": "pwelcome@wingatecompanies.com",
    "suggestedAccountId": "001F000001fe43hIAA",
    "suggestedAccountName": "Wingate Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTnVPAA0",
    "contactName": "Rosanne Bethel",
    "contactEmail": "scc@wingatecompanies.com",
    "suggestedAccountId": "001F000001fe43hIAA",
    "suggestedAccountName": "Wingate Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxFHAA0",
    "contactName": "Josette Gains",
    "contactEmail": "station464@wingatecompanies.com",
    "suggestedAccountId": "001F000001fe43hIAA",
    "suggestedAccountName": "Wingate Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002S5jBCQAZ",
    "contactName": "Brent Wegner",
    "contactEmail": "brent@abodo.com",
    "suggestedAccountId": "0013j00002dK1qrAAC",
    "suggestedAccountName": "Test Account",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003q6Z6pAAE",
    "contactName": "Contracts",
    "contactEmail": "contracts@abodo.com",
    "suggestedAccountId": "0013j00002dK1qrAAC",
    "suggestedAccountName": "Test Account",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003FfLI7AAN",
    "contactName": "Josh Vasseur",
    "contactEmail": "josh@abodo.com",
    "suggestedAccountId": "0013j00002dK1qrAAC",
    "suggestedAccountName": "Test Account",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002T7NSFQA3",
    "contactName": "Kari Schneider",
    "contactEmail": "kari@abodo.com",
    "suggestedAccountId": "0013j00002dK1qrAAC",
    "suggestedAccountName": "Test Account",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AGtRAAW",
    "contactName": "Brian Reed",
    "contactEmail": "brian.reed@freemanwebb.com",
    "suggestedAccountId": "001F000001SUx58IAD",
    "suggestedAccountName": "Freeman Webb Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002dUDCvQAO",
    "contactName": "Brian Soukup",
    "contactEmail": "brian.soukup@oldtownsq.com",
    "suggestedAccountId": "0012A00002D1kGEQAZ",
    "suggestedAccountName": "Old Town Square Properties, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002dUDCyQAO",
    "contactName": "Ed Stoner",
    "contactEmail": "ed.sonter@oldtownsq.com",
    "suggestedAccountId": "0012A00002D1kGEQAZ",
    "suggestedAccountName": "Old Town Square Properties, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002dUDCwQAO",
    "contactName": "Mindy Taylor",
    "contactEmail": "mindy.taylor@oldtownsq.com",
    "suggestedAccountId": "0012A00002D1kGEQAZ",
    "suggestedAccountName": "Old Town Square Properties, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002dUDCxQAO",
    "contactName": "Patrick Soukup",
    "contactEmail": "patrick.soukup@oldtownsq.com",
    "suggestedAccountId": "0012A00002D1kGEQAZ",
    "suggestedAccountName": "Old Town Square Properties, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrWmAAK",
    "contactName": "Janet Torres",
    "contactEmail": "buenavista@monarchnm.com",
    "suggestedAccountId": "001F000001gokElIAI",
    "suggestedAccountName": "Monarch Properties Inc (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002a2cnbQAA",
    "contactName": "Constance Franklin",
    "contactEmail": "burnettplace@macdonald-companies.com",
    "suggestedAccountId": "0012A00002D1lutQAB",
    "suggestedAccountName": "MPM-Envolve  (Kerrville)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqQEAA0",
    "contactName": "Jennifer Speed",
    "contactEmail": "mustang@macdonald-companies.com",
    "suggestedAccountId": "0012A00002D1lutQAB",
    "suggestedAccountName": "MPM-Envolve  (Kerrville)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpaOAAS",
    "contactName": "Carolyn Sexton",
    "contactEmail": "canterbury@sealyrealty.com",
    "suggestedAccountId": "0013j00003IKTbwAAH",
    "suggestedAccountName": "Sealy Management Co., Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqxcAAC",
    "contactName": "Kellie Minor",
    "contactEmail": "foresttrail@sealyrealty.com",
    "suggestedAccountId": "0013j00003IKTbwAAH",
    "suggestedAccountName": "Sealy Management Co., Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqcHAAS",
    "contactName": "Aneyra Littlefield",
    "contactEmail": "highcountry@sealyrealty.com",
    "suggestedAccountId": "0013j00003IKTbwAAH",
    "suggestedAccountName": "Sealy Management Co., Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTyxQAAS",
    "contactName": "Shelia Locke",
    "contactEmail": "mview@sealyrealty.com",
    "suggestedAccountId": "0013j00003IKTbwAAH",
    "suggestedAccountName": "Sealy Management Co., Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTnP0AAK",
    "contactName": "Rachel Smith",
    "contactEmail": "rivermont@sealyrealty.com",
    "suggestedAccountId": "0013j00003IKTbwAAH",
    "suggestedAccountName": "Sealy Management Co., Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTnJ1AAK",
    "contactName": "Leslie Kynard",
    "contactEmail": "stonecreek@sealyrealty.com",
    "suggestedAccountId": "0013j00003IKTbwAAH",
    "suggestedAccountName": "Sealy Management Co., Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTsueAAC",
    "contactName": "Paula McGowan",
    "contactEmail": "capitolview@trioproperties.com",
    "suggestedAccountId": "0012A00002D1kJVQAZ",
    "suggestedAccountName": "TRIO Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003kfxpVAAQ",
    "contactName": "Cary Rosenblum",
    "contactEmail": "cary@elmingtoncapital.com",
    "suggestedAccountId": "001F000001fe446IAA",
    "suggestedAccountName": "Elmington Capital Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxd6AAC",
    "contactName": "Laura Nelson",
    "contactEmail": "casabella@neiders.com",
    "suggestedAccountId": "0012A00002D1mEtQAJ",
    "suggestedAccountName": "Neiders Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTy8PAAS",
    "contactName": "Bradley Himmelstein",
    "contactEmail": "cascade@tcbinc.org",
    "suggestedAccountId": "0013j00003Hk065AAB",
    "suggestedAccountName": "Community Builders, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUB86AAG",
    "contactName": "Audrey Latham",
    "contactEmail": "cgrammar@tcbinc.org",
    "suggestedAccountId": "0013j00003Hk065AAB",
    "suggestedAccountName": "Community Builders, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0FeAAK",
    "contactName": "Velvet Cupiton",
    "contactEmail": "cohoes@tcbinc.org",
    "suggestedAccountId": "0013j00003Hk065AAB",
    "suggestedAccountName": "Community Builders, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUOrzAAG",
    "contactName": "Dana Sumpter",
    "contactEmail": "dsumpter@tcbinc.org",
    "suggestedAccountId": "0013j00003Hk065AAB",
    "suggestedAccountName": "Community Builders, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTuIcAAK",
    "contactName": "Nakia Boddy",
    "contactEmail": "fairlawn@tcbinc.org",
    "suggestedAccountId": "0013j00003Hk065AAB",
    "suggestedAccountName": "Community Builders, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0JuAAK",
    "contactName": "Waldina Bonilla",
    "contactEmail": "frankpark@tcbinc.org",
    "suggestedAccountId": "0013j00003Hk065AAB",
    "suggestedAccountName": "Community Builders, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvr6AAC",
    "contactName": "Zulimar Cruz",
    "contactEmail": "loomworks@tcbinc.org",
    "suggestedAccountId": "0013j00003Hk065AAB",
    "suggestedAccountName": "Community Builders, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gToLPAA0",
    "contactName": "Ruth Allgaier",
    "contactEmail": "rallgaier@tcbinc.org",
    "suggestedAccountId": "0013j00003Hk065AAB",
    "suggestedAccountName": "Community Builders, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxcHAAS",
    "contactName": "Silvia Ighodaro",
    "contactEmail": "tapestry@tcbinc.org",
    "suggestedAccountId": "0013j00003Hk065AAB",
    "suggestedAccountName": "Community Builders, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AGYxAAO",
    "contactName": "Catherine McDermott",
    "contactEmail": "catherine@galvingroupre.com",
    "suggestedAccountId": "0013j000039cHOGAA2",
    "suggestedAccountName": "Galvin Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AGYsAAO",
    "contactName": "David Hughes",
    "contactEmail": "david@galvingroupre.com",
    "suggestedAccountId": "0013j000039cHOGAA2",
    "suggestedAccountName": "Galvin Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AGV5AAO",
    "contactName": "Derek Byrne",
    "contactEmail": "derek@galvingroupre.com",
    "suggestedAccountId": "0013j000039cHOGAA2",
    "suggestedAccountName": "Galvin Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AGYEAA4",
    "contactName": "Eamon Galvin",
    "contactEmail": "eamon@galvingroupre.com",
    "suggestedAccountId": "0013j000039cHOGAA2",
    "suggestedAccountName": "Galvin Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gSkK2AAK",
    "contactName": "Matt Steele",
    "contactEmail": "cayugaview@rcgltd.net",
    "suggestedAccountId": "001Rh00000KznpoIAB",
    "suggestedAccountName": "Rochesters Cornerstone Grp",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEUXAA4",
    "contactName": "Chris Dunn",
    "contactEmail": "cdunn@vicinialiving.com",
    "suggestedAccountId": "0013j000034HVBiAAO",
    "suggestedAccountName": "Vicinia Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AERyAAO",
    "contactName": "Ericka Sommers",
    "contactEmail": "esommers@vicinialiving.com",
    "suggestedAccountId": "0013j000034HVBiAAO",
    "suggestedAccountName": "Vicinia Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AETpAAO",
    "contactName": "Kelli Mattingly",
    "contactEmail": "kmattingly@vicinialiving.com",
    "suggestedAccountId": "0013j000034HVBiAAO",
    "suggestedAccountName": "Vicinia Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPAiAAO",
    "contactName": "Jackie Phelps",
    "contactEmail": "ceaderwood@pre-3.com",
    "suggestedAccountId": "001F000001GXHKwIAP",
    "suggestedAccountName": "Premier Real Estate Management LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0LEAA0",
    "contactName": "Gwen Laster",
    "contactEmail": "cedarave@hsimanagement.com",
    "suggestedAccountId": "0012A00002D1kWFQAZ",
    "suggestedAccountName": "HSI Management, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvJKAA0",
    "contactName": "Jennifer Reyna",
    "contactEmail": "centennial@churchillforge.com",
    "suggestedAccountId": "0012A00002D1qQVQAZ",
    "suggestedAccountName": "Churchill Forge Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTtqCAAS",
    "contactName": "Vianela Morales",
    "contactEmail": "court@churchillforge.com",
    "suggestedAccountId": "0012A00002D1qQVQAZ",
    "suggestedAccountName": "Churchill Forge Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTuPZAA0",
    "contactName": "Mayra Mitchell",
    "contactEmail": "cricket@churchillforge.com",
    "suggestedAccountId": "0012A00002D1qQVQAZ",
    "suggestedAccountName": "Churchill Forge Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxaTAAS",
    "contactName": "Chris McEwan",
    "contactEmail": "presidential@churchillforge.com",
    "suggestedAccountId": "0012A00002D1qQVQAZ",
    "suggestedAccountName": "Churchill Forge Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTwJtAAK",
    "contactName": "Lina Llanos",
    "contactEmail": "spruceknoll@churchillforge.com",
    "suggestedAccountId": "0012A00002D1qQVQAZ",
    "suggestedAccountName": "Churchill Forge Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPD9AAO",
    "contactName": "Krystal Negrete",
    "contactEmail": "cermgr@amcllc.net",
    "suggestedAccountId": "0012A00002D1m8cQAB",
    "suggestedAccountName": "AMC Management LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AGXBAA4",
    "contactName": "Curtis Furtaw",
    "contactEmail": "cfurtaw@curatorpm.com",
    "suggestedAccountId": "0013j00002zjLIUAA2",
    "suggestedAccountName": "Curator Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041A9lnAAC",
    "contactName": "Christina Hacobian",
    "contactEmail": "chacobian@goldrichkest.com",
    "suggestedAccountId": "0012A00002AM0tCQAT",
    "suggestedAccountName": "Goldrich Kest (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AGa5AAG",
    "contactName": "Cortney Hartman",
    "contactEmail": "chartman@1sthousing.com",
    "suggestedAccountId": "0012A00002D1kvOQAR",
    "suggestedAccountName": "First Housing Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003vwmLBAAY",
    "contactName": "Cheyenne Quach",
    "contactEmail": "cheyenneq@omninet.com",
    "suggestedAccountId": "0012A00002D1kDNQAZ",
    "suggestedAccountName": "Omninet Capital (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AGuWAAW",
    "contactName": "Lauren Kiraly",
    "contactEmail": "chicovillaeast@aorealtycorp.com",
    "suggestedAccountId": "0013j00002zifYdAAI",
    "suggestedAccountName": "AO Realty Corporation (San Francisco)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHJPAA4",
    "contactName": "Lauren Kiraly",
    "contactEmail": "lassenplace@aorealtycorp.com",
    "suggestedAccountId": "0013j00002zifYdAAI",
    "suggestedAccountName": "AO Realty Corporation (San Francisco)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHCJAA4",
    "contactName": "Lauren Kiraly",
    "contactEmail": "paloverde@aorealtycorp.com",
    "suggestedAccountId": "0013j00002zifYdAAI",
    "suggestedAccountName": "AO Realty Corporation (San Francisco)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHHxAAO",
    "contactName": "Lisa Julien",
    "contactEmail": "reddinghilltop@aorealtycorp.com",
    "suggestedAccountId": "0013j00002zifYdAAI",
    "suggestedAccountName": "AO Realty Corporation (San Francisco)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHCtAAO",
    "contactName": "Sabrina Johnson",
    "contactEmail": "westridge@aorealtycorp.com",
    "suggestedAccountId": "0013j00002zifYdAAI",
    "suggestedAccountName": "AO Realty Corporation (San Francisco)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEWYAA4",
    "contactName": "Chris Wilkerson",
    "contactEmail": "chris.wilkerson@dayspringky.org",
    "suggestedAccountId": "0012A00002D1klfQAB",
    "suggestedAccountName": "Day Spring Communities (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEWTAA4",
    "contactName": "LaDawn Perkins",
    "contactEmail": "ladawn.perkins@dayspringky.org",
    "suggestedAccountId": "0012A00002D1klfQAB",
    "suggestedAccountName": "Day Spring Communities (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041ADyUAAW",
    "contactName": "Lauren Hays",
    "contactEmail": "lauren.hays@dayspringky.org",
    "suggestedAccountId": "0012A00002D1klfQAB",
    "suggestedAccountName": "Day Spring Communities (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEVuAAO",
    "contactName": "Christopher Bradburn",
    "contactEmail": "christopher.bradburn@denizenmanagement.com",
    "suggestedAccountId": "001F000001WXoi5IAD",
    "suggestedAccountName": "Denizen Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEYKAA4",
    "contactName": "Craig LaDines",
    "contactEmail": "cl@cityscaperesidential.com",
    "suggestedAccountId": "0012A00002D1khGQAR",
    "suggestedAccountName": "Cityscape Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEYPAA4",
    "contactName": "Holli Moore",
    "contactEmail": "hm@cityscaperesidential.com",
    "suggestedAccountId": "0012A00002D1khGQAR",
    "suggestedAccountName": "Cityscape Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEaBAAW",
    "contactName": "Mary Jane Trujillo",
    "contactEmail": "mjt@cityscaperesidential.com",
    "suggestedAccountId": "0012A00002D1khGQAR",
    "suggestedAccountName": "Cityscape Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9iQAA",
    "contactName": "Unknown",
    "contactEmail": "cleveland.100@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9jQAA",
    "contactName": "Dyer",
    "contactEmail": "dyer.269@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9kQAA",
    "contactName": "Freeman",
    "contactEmail": "freeman.466@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9lQAA",
    "contactName": "Unknown",
    "contactEmail": "hensal.7@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9mQAA",
    "contactName": "Unknown",
    "contactEmail": "keshk.3@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9nQAA",
    "contactName": "Kreider",
    "contactEmail": "kreider.30@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9oQAA",
    "contactName": "Lee",
    "contactEmail": "lee.6335@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9pQAA",
    "contactName": "Unknown",
    "contactEmail": "leonard.370@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9qQAA",
    "contactName": "McCauley",
    "contactEmail": "mccauley.129@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9rQAA",
    "contactName": "McComb",
    "contactEmail": "mccomb.34@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9sQAA",
    "contactName": "Messick",
    "contactEmail": "messick.30@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9tQAA",
    "contactName": "Mumaw",
    "contactEmail": "mumaw.27@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9uQAA",
    "contactName": "Patel",
    "contactEmail": "patel.2010@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9vQAA",
    "contactName": "Senuta",
    "contactEmail": "senuta.1@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9wQAA",
    "contactName": "Shanker",
    "contactEmail": "shanker.14@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9xQAA",
    "contactName": "Stahlgren",
    "contactEmail": "stahlgren.1@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9yQAA",
    "contactName": "Stoiber",
    "contactEmail": "stoiber.5@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9hQAA",
    "contactName": "Morgan Trussel",
    "contactEmail": "trussel.3s@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6h9zQAA",
    "contactName": "Welsh",
    "contactEmail": "welsh.243@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hA0QAI",
    "contactName": "Zupancic",
    "contactEmail": "zupancic.12@osu.edu",
    "suggestedAccountId": "0012A00002D1lU3QAJ",
    "suggestedAccountName": "Ohio State University Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTuwtAAC",
    "contactName": "Ovetta Morgan",
    "contactEmail": "cloverdalegarden@mondayproperties.com",
    "suggestedAccountId": "0013j000039cI6lAAE",
    "suggestedAccountName": "Monday & Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEgJAAW",
    "contactName": "Christine Nesbitt",
    "contactEmail": "cnesbitt@uippm.com",
    "suggestedAccountId": "0012A00002D1kKYQAZ",
    "suggestedAccountName": "UIP Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0mjAAC",
    "contactName": "Thomas Briggs",
    "contactEmail": "colonialcourt@paredim.com",
    "suggestedAccountId": "001Rh00000KzmuBIAR",
    "suggestedAccountName": "Paredim Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTnKAAA0",
    "contactName": "Michelle .",
    "contactEmail": "columbiasquare@burtoncarol.com",
    "suggestedAccountId": "0012A00002D1qVFQAZ",
    "suggestedAccountName": "Burton Carol Management LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUKFjAAO",
    "contactName": "Amanda Hess",
    "contactEmail": "greatnorthernvillage@burtoncarol.com",
    "suggestedAccountId": "0012A00002D1qVFQAZ",
    "suggestedAccountName": "Burton Carol Management LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPb9AAG",
    "contactName": "Susan Orcutt",
    "contactEmail": "lakeparkvillage@burtoncarol.com",
    "suggestedAccountId": "0012A00002D1qVFQAZ",
    "suggestedAccountName": "Burton Carol Management LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxipAAC",
    "contactName": "Tammie Valentine",
    "contactEmail": "remington@burtoncarol.com",
    "suggestedAccountId": "0012A00002D1qVFQAZ",
    "suggestedAccountName": "Burton Carol Management LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrLEAA0",
    "contactName": "Misty Tusing",
    "contactEmail": "ridgewoodhouse@burtoncarol.com",
    "suggestedAccountId": "0012A00002D1qVFQAZ",
    "suggestedAccountName": "Burton Carol Management LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hEIQAY",
    "contactName": "Courtney Miller",
    "contactEmail": "comiller@weinsteinproperties.com",
    "suggestedAccountId": "001F000001GXHF3IAP",
    "suggestedAccountName": "Weinstein Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hEHQAY",
    "contactName": "Jessica Montford",
    "contactEmail": "jmontford@weinsteinproperties.com",
    "suggestedAccountId": "001F000001GXHF3IAP",
    "suggestedAccountName": "Weinstein Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrdBAAS",
    "contactName": "Meghan Vasquez",
    "contactEmail": "commonwealth@nwrliving.com",
    "suggestedAccountId": "001F000001GXHEqIAP",
    "suggestedAccountName": "Northwood Ravin (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUOrGAAW",
    "contactName": "Jamie Peace",
    "contactEmail": "concordparkcd@highmarkres.com",
    "suggestedAccountId": "0013j00003Hk08sAAB",
    "suggestedAccountName": "Highmark Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxn6AAC",
    "contactName": "Jason Blue",
    "contactEmail": "eastvueranch@highmarkres.com",
    "suggestedAccountId": "0013j00003Hk08sAAB",
    "suggestedAccountName": "Highmark Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxcFAAS",
    "contactName": "Tasha Strange",
    "contactEmail": "elanatmallardcreekcd@highmarkres.com",
    "suggestedAccountId": "0013j00003Hk08sAAB",
    "suggestedAccountName": "Highmark Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqaHAAS",
    "contactName": "Tiffany Casey",
    "contactEmail": "madisonsouthpark@highmarkres.com",
    "suggestedAccountId": "0013j00003Hk08sAAB",
    "suggestedAccountName": "Highmark Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxDxAAK",
    "contactName": "Joe Moreno",
    "contactEmail": "prescottwoodscd@highmarkres.com",
    "suggestedAccountId": "0013j00003Hk08sAAB",
    "suggestedAccountName": "Highmark Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTwxYAAS",
    "contactName": "Tiffany Walker",
    "contactEmail": "thebaxterdecaturcd@highmarkres.com",
    "suggestedAccountId": "0013j00003Hk08sAAB",
    "suggestedAccountName": "Highmark Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUECtAAO",
    "contactName": "Cassandra Fields",
    "contactEmail": "thebrook@highmarkres.com",
    "suggestedAccountId": "0013j00003Hk08sAAB",
    "suggestedAccountName": "Highmark Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUOTBAA4",
    "contactName": "Sharron Brown",
    "contactEmail": "thegraysonl1@highmarkres.com",
    "suggestedAccountId": "0013j00003Hk08sAAB",
    "suggestedAccountName": "Highmark Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTnbVAAS",
    "contactName": "Lettie Reyna",
    "contactEmail": "towneson10th@highmarkres.com",
    "suggestedAccountId": "0013j00003Hk08sAAB",
    "suggestedAccountName": "Highmark Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUBW9AAO",
    "contactName": "Betina Severn",
    "contactEmail": "conteecrossingmkt@windsorcommunities.com",
    "suggestedAccountId": "0012A00002AM1I7QAL",
    "suggestedAccountName": "Windsor Communities",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003FdjaOAAR",
    "contactName": "Samantha Fowler",
    "contactEmail": "sfowler@windsorcommunities.com",
    "suggestedAccountId": "0012A00002AM1I7QAL",
    "suggestedAccountName": "Windsor Communities",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvffAAC",
    "contactName": "Annie Williams",
    "contactEmail": "corazon@rpmliving.com",
    "suggestedAccountId": "0012A00002D1m3FQAR",
    "suggestedAccountName": "RPM Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUKQTAA4",
    "contactName": "Sara Ghedi",
    "contactEmail": "crescent@rpmliving.com",
    "suggestedAccountId": "0012A00002D1m3FQAR",
    "suggestedAccountName": "RPM Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTtAlAAK",
    "contactName": "Christina Pietrantanio",
    "contactEmail": "leanderjunction@rpmliving.com",
    "suggestedAccountId": "0012A00002D1m3FQAR",
    "suggestedAccountName": "RPM Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUK2lAAG",
    "contactName": "Abel Ruiz",
    "contactEmail": "muirlake@rpmliving.com",
    "suggestedAccountId": "0012A00002D1m3FQAR",
    "suggestedAccountName": "RPM Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gToFdAAK",
    "contactName": "Becca Shufelt",
    "contactEmail": "countrymanor@gellerproperties.com",
    "suggestedAccountId": "0012A00002D1lAWQAZ",
    "suggestedAccountName": "Geller Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003Ff2ecAAB",
    "contactName": "Trisha Bolden",
    "contactEmail": "creekwood@raskinco.com",
    "suggestedAccountId": "0012A00002D1lnVQAR",
    "suggestedAccountName": "Edwin B. Raskin Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxbzAAC",
    "contactName": "Joan Derschsiel",
    "contactEmail": "cresmont@wpmllc.com",
    "suggestedAccountId": "0012A00002D1qQ7QAJ",
    "suggestedAccountName": "WPM Real Estate Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTuCYAA0",
    "contactName": "Aisha Jackson",
    "contactEmail": "foxglenoffice@wpmllc.com",
    "suggestedAccountId": "0012A00002D1qQ7QAJ",
    "suggestedAccountName": "WPM Real Estate Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTygwAAC",
    "contactName": "Jessica Snyder",
    "contactEmail": "riverscrossingoffice@wpmllc.com",
    "suggestedAccountId": "0012A00002D1qQ7QAJ",
    "suggestedAccountName": "WPM Real Estate Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrztAAC",
    "contactName": "Chris Richmond",
    "contactEmail": "crichmond@seniorlifestyle.com",
    "suggestedAccountId": "0012A00002D1kcEQAR",
    "suggestedAccountName": "Senior Lifestyle Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUKXLAA4",
    "contactName": "Krista Corley",
    "contactEmail": "kcorley@seniorlifestyle.com",
    "suggestedAccountId": "0012A00002D1kcEQAR",
    "suggestedAccountName": "Senior Lifestyle Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpm1AAC",
    "contactName": "Laurie Lewis",
    "contactEmail": "lauriel@seniorlifestyle.com",
    "suggestedAccountId": "0012A00002D1kcEQAR",
    "suggestedAccountName": "Senior Lifestyle Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPB5AAO",
    "contactName": "Maureen Clarke",
    "contactEmail": "mclarke@seniorlifestyle.com",
    "suggestedAccountId": "0012A00002D1kcEQAR",
    "suggestedAccountName": "Senior Lifestyle Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "003F000001SoNyDIAV",
    "contactName": "Chelsea Roberts",
    "contactEmail": "croberts@monarchinvestment.com",
    "suggestedAccountId": "0012A00002D1kGbQAJ",
    "suggestedAccountName": "Monarch Investment & Management Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "003F000001SoNxtIAF",
    "contactName": "Lindsay (Kauffman) Rumple",
    "contactEmail": "lkauffman@monarchinvestment.com",
    "suggestedAccountId": "0012A00002D1kGbQAJ",
    "suggestedAccountName": "Monarch Investment & Management Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUKe5AAG",
    "contactName": "Connie Roland",
    "contactEmail": "croland@cagan.com",
    "suggestedAccountId": "001F000001lV5tXIAS",
    "suggestedAccountName": "Cagan Management Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gToqNAAS",
    "contactName": "Hanna Dockery",
    "contactEmail": "hdockery@cagan.com",
    "suggestedAccountId": "001F000001lV5tXIAS",
    "suggestedAccountName": "Cagan Management Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTw4OAAS",
    "contactName": "Terri Felix",
    "contactEmail": "tfelix@cagan.com",
    "suggestedAccountId": "001F000001lV5tXIAS",
    "suggestedAccountName": "Cagan Management Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPnOAAW",
    "contactName": "Calisha Thomas",
    "contactEmail": "cthomas@hjrussell.com",
    "suggestedAccountId": "0012A00002D1kXKQAZ",
    "suggestedAccountName": "HJ Russell & Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUJ04AAG",
    "contactName": "Gary Walton",
    "contactEmail": "gwalton@hjrussell.com",
    "suggestedAccountId": "0012A00002D1kXKQAZ",
    "suggestedAccountName": "HJ Russell & Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHd0AAG",
    "contactName": "Carie Wagner",
    "contactEmail": "cwagner@essentialpm.com",
    "suggestedAccountId": "0012A00002Z49NcQAJ",
    "suggestedAccountName": "Essential Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEuqAAG",
    "contactName": "Cori Wright",
    "contactEmail": "cwright@lautrecltd.com",
    "suggestedAccountId": "0012A00002D1kx4QAB",
    "suggestedAccountName": "Lautrec, Ltd. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrN6AAK",
    "contactName": "Marie Alicea",
    "contactEmail": "d.mcmurry@capstonemultifamily.com",
    "suggestedAccountId": "0012A00002D1lNVQAZ",
    "suggestedAccountName": "Capstone Multi-Family Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrBUAA0",
    "contactName": "Maria Nunez",
    "contactEmail": "m.nunez@capstonemultifamily.com",
    "suggestedAccountId": "0012A00002D1lNVQAZ",
    "suggestedAccountName": "Capstone Multi-Family Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0LCAA0",
    "contactName": "Destiney .",
    "contactEmail": "dacosta@centrapartners.com",
    "suggestedAccountId": "0012A00002D1lvfQAB",
    "suggestedAccountName": "Centra Partners (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTwffAAC",
    "contactName": "Stephanie Pitts",
    "contactEmail": "stitts@centrapartners.com",
    "suggestedAccountId": "0012A00002D1lvfQAB",
    "suggestedAccountName": "Centra Partners (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEYeAAO",
    "contactName": "Darah Snider",
    "contactEmail": "darahsnider@rentbiggs.com",
    "suggestedAccountId": "0012A00002D1kfSQAR",
    "suggestedAccountName": "Biggs Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEZ3AAO",
    "contactName": "Jake Snider",
    "contactEmail": "jakesnider@rentbiggs.com",
    "suggestedAccountId": "0012A00002D1kfSQAR",
    "suggestedAccountName": "Biggs Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEZDAA4",
    "contactName": "Jamie Haight",
    "contactEmail": "jhaight@rentbiggs.com",
    "suggestedAccountId": "0012A00002D1kfSQAR",
    "suggestedAccountName": "Biggs Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AETZAA4",
    "contactName": "Melanie Miller",
    "contactEmail": "mmiller@rentbiggs.com",
    "suggestedAccountId": "0012A00002D1kfSQAR",
    "suggestedAccountName": "Biggs Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hCFQAY",
    "contactName": "David B. Shemano Elgrably",
    "contactEmail": "davidelgrably@realtymx.com",
    "suggestedAccountId": "0013j000034FwPEAA0",
    "suggestedAccountName": "B&H Properties",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hCGQAY",
    "contactName": "Support",
    "contactEmail": "support@realtymx.com",
    "suggestedAccountId": "0013j000034FwPEAA0",
    "suggestedAccountName": "B&H Properties",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hDyQAI",
    "contactName": "David Gelfenbeyn",
    "contactEmail": "davidgelf@opgny.com",
    "suggestedAccountId": "0012A00002D1lIYQAZ",
    "suggestedAccountName": "Oxford Property Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hDzQAI",
    "contactName": "David Gef",
    "contactEmail": "davidgelf@opgny.com",
    "suggestedAccountId": "0012A00002D1lIYQAZ",
    "suggestedAccountName": "Oxford Property Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AA1bAAG",
    "contactName": "Dominic Cancelliere",
    "contactEmail": "dcancelliere@cmpliving.com",
    "suggestedAccountId": "0012A00002D1lT9QAJ",
    "suggestedAccountName": "Cornerstone Managed Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AGU7AAO",
    "contactName": "Dana Delgado",
    "contactEmail": "ddelgado@fourmidable.com",
    "suggestedAccountId": "0012A00002Al4OfQAJ",
    "suggestedAccountName": "Fourmidable Real Estate Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AGSuAAO",
    "contactName": "Kim Clabuesch",
    "contactEmail": "kclabuesch@fourmidable.com",
    "suggestedAccountId": "0012A00002Al4OfQAJ",
    "suggestedAccountName": "Fourmidable Real Estate Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003vwndvAAA",
    "contactName": "Debra Gotland",
    "contactEmail": "debragodtland@velairmanagement.com",
    "suggestedAccountId": "001F000001i0K2QIAU",
    "suggestedAccountName": "Velair Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpgDAAS",
    "contactName": "Deb Kotik",
    "contactEmail": "deerrun@townmgmt.com",
    "suggestedAccountId": "0013j00003Hk06dAAB",
    "suggestedAccountName": "Town Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPbnAAG",
    "contactName": "Jillian Lavine",
    "contactEmail": "discoverygateway@pegasusresidential.com",
    "suggestedAccountId": "0012A00002D1kSzQAJ",
    "suggestedAccountName": "Pegasus Residential, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUIzWAAW",
    "contactName": "Jenny Kane",
    "contactEmail": "retreatatriverside@pegasusresidential.com",
    "suggestedAccountId": "0012A00002D1kSzQAJ",
    "suggestedAccountName": "Pegasus Residential, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTw9WAAS",
    "contactName": "Zayna Callier",
    "contactEmail": "vickers-cm@pegasusresidential.com",
    "suggestedAccountId": "0012A00002D1kSzQAJ",
    "suggestedAccountName": "Pegasus Residential, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0lmAAC",
    "contactName": "Angela Durcan",
    "contactEmail": "dorado@wehnermultifamily.com",
    "suggestedAccountId": "0012A00002D1lssQAB",
    "suggestedAccountName": "Wehner Multifamily, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003OQgwYAAT",
    "contactName": "Daniel Orr",
    "contactEmail": "dorr@dpllc.com",
    "suggestedAccountId": "0012A00002D1jcAQAR",
    "suggestedAccountName": "Dominion Partners, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j0000419nepAAA",
    "contactName": "Dorylynn Sullivan",
    "contactEmail": "dorylynn.sullivan@ccinvest.com",
    "suggestedAccountId": "0012A00002D1jssQAB",
    "suggestedAccountName": "California Commercial Investment Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j0000419nWwAAI",
    "contactName": "Katie Garay",
    "contactEmail": "katie.garay@ccinvest.com",
    "suggestedAccountId": "0012A00002D1jssQAB",
    "suggestedAccountName": "California Commercial Investment Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003ipNNRAA2",
    "contactName": "Rochelle Sabo",
    "contactEmail": "rochellesabo@ccinvest.com",
    "suggestedAccountId": "0012A00002D1jssQAB",
    "suggestedAccountName": "California Commercial Investment Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTwbRAAS",
    "contactName": "Debbie Quatraro",
    "contactEmail": "dquatraro@aiyproperties.com",
    "suggestedAccountId": "0012A00002D1lXQQAZ",
    "suggestedAccountName": "AIY Properties, Inc (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrvFAAS",
    "contactName": "Sonja Kellam",
    "contactEmail": "draperplace@rkwresidential.com",
    "suggestedAccountId": "0012A00002D1kPyQAJ",
    "suggestedAccountName": "RKW Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvIoAAK",
    "contactName": "Darcie Burnstein",
    "contactEmail": "verdeleasing@rkwresidential.com",
    "suggestedAccountId": "0012A00002D1kPyQAJ",
    "suggestedAccountName": "RKW Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003xlCqmAAE",
    "contactName": "Eric Baker",
    "contactEmail": "ebaker@kittleproperties.com",
    "suggestedAccountId": "0012A00002D1kexQAB",
    "suggestedAccountName": "Kittle Property Group, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUKF1AAO",
    "contactName": "Rhonda Smith",
    "contactEmail": "edenwood@wrhrealty.com",
    "suggestedAccountId": "0012A00002D1qPlQAJ",
    "suggestedAccountName": "WRH Realty Services, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUOlMAAW",
    "contactName": "Angela Covington",
    "contactEmail": "spauldinghillsmgr@wrhrealty.com",
    "suggestedAccountId": "0012A00002D1qPlQAJ",
    "suggestedAccountName": "WRH Realty Services, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003fBWuZAAW",
    "contactName": "Edsel",
    "contactEmail": "edsel@skypropertiesinc.com",
    "suggestedAccountId": "0013j00002brP8rAAE",
    "suggestedAccountName": "SKY Properties Inc (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041A9aGAAS",
    "contactName": "Eve Henderson",
    "contactEmail": "ehenderson@affinityproperty.com",
    "suggestedAccountId": "001F000001GXHUpIAP",
    "suggestedAccountName": "Affinity Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHLGAA4",
    "contactName": "Elsa Hyde",
    "contactEmail": "ehyde@travishyde.com",
    "suggestedAccountId": "0012A00002AM0tpQAD",
    "suggestedAccountName": "Travis Hyde Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gSgT2AAK",
    "contactName": "Erik Johnson",
    "contactEmail": "ejohnson@billingsleyco.com",
    "suggestedAccountId": "0012A00002D1m7vQAB",
    "suggestedAccountName": "Billingsley Co. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqc6AAC",
    "contactName": "Steven Ziegler",
    "contactEmail": "elevateinfo@foresiterealty.com",
    "suggestedAccountId": "001F000001GXHJPIA5",
    "suggestedAccountName": "Foresite Realty Partners, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hAwQAI",
    "contactName": "Unknown",
    "contactEmail": "emc72@pitt.edu",
    "suggestedAccountId": "0012A00002D1lf0QAB",
    "suggestedAccountName": "University of Pittsburgh Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hAxQAI",
    "contactName": "Unknown",
    "contactEmail": "jec187@pitt.edu",
    "suggestedAccountId": "0012A00002D1lf0QAB",
    "suggestedAccountName": "University of Pittsburgh Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hAzQAI",
    "contactName": "Max William Polec",
    "contactEmail": "mwp30@pitt.edu",
    "suggestedAccountId": "0012A00002D1lf0QAB",
    "suggestedAccountName": "University of Pittsburgh Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hAyQAI",
    "contactName": "Unknown",
    "contactEmail": "zhz82@pitt.edu",
    "suggestedAccountId": "0012A00002D1lf0QAB",
    "suggestedAccountName": "University of Pittsburgh Housing (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003OOQ2eAAH",
    "contactName": "Eric Medlin",
    "contactEmail": "emedlin@thepencos.com",
    "suggestedAccountId": "0013j000039cHoEAAU",
    "suggestedAccountName": "Pendergraph Management Company, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00002OEOy2AAH",
    "contactName": "Joshua Baker",
    "contactEmail": "estanciamgr@allied-orion.com",
    "suggestedAccountId": "0012A00002D1m47QAB",
    "suggestedAccountName": "AOG Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUJN9AAO",
    "contactName": "Tammy Harris",
    "contactEmail": "hopehouse@allied-orion.com",
    "suggestedAccountId": "0012A00002D1m47QAB",
    "suggestedAccountName": "AOG Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEuzAAG",
    "contactName": "Felicia Campbell",
    "contactEmail": "felicia@tiehengroup.com",
    "suggestedAccountId": "0012A00002D1kjnQAB",
    "suggestedAccountName": "Tiehen Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUKKCAA4",
    "contactName": "Michael Tisdale",
    "contactEmail": "fernhall@intermarkmgt.com",
    "suggestedAccountId": "001F000001GXHFzIAP",
    "suggestedAccountName": "Intermark Management Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUE74AAG",
    "contactName": "Kelly Burroughs",
    "contactEmail": "lexingtonpark@intermarkmgt.com",
    "suggestedAccountId": "001F000001GXHFzIAP",
    "suggestedAccountName": "Intermark Management Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrFZAA0",
    "contactName": "Catherine Preston",
    "contactEmail": "rockpointe@intermarkmgt.com",
    "suggestedAccountId": "001F000001GXHFzIAP",
    "suggestedAccountName": "Intermark Management Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTukLAAS",
    "contactName": "Kayla Bennett",
    "contactEmail": "saddlebrook@intermarkmgt.com",
    "suggestedAccountId": "001F000001GXHFzIAP",
    "suggestedAccountName": "Intermark Management Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqWJAA0",
    "contactName": "Jamie Harrell",
    "contactEmail": "wellington@intermarkmgt.com",
    "suggestedAccountId": "001F000001GXHFzIAP",
    "suggestedAccountName": "Intermark Management Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTsYDAA0",
    "contactName": "Mary Gregory",
    "contactEmail": "westfield@intermarkmgt.com",
    "suggestedAccountId": "001F000001GXHFzIAP",
    "suggestedAccountName": "Intermark Management Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpy5AAC",
    "contactName": "Kim Cooper",
    "contactEmail": "forestbrooke@mgicommunities.com",
    "suggestedAccountId": "001F0000017ONRNIA4",
    "suggestedAccountName": "MGI Communities (Powell)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzWSAA0",
    "contactName": "Michelle DeVito",
    "contactEmail": "riverview@mgicommunities.com",
    "suggestedAccountId": "001F0000017ONRNIA4",
    "suggestedAccountName": "MGI Communities (Powell)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvVBAA0",
    "contactName": "Jacqueline Goodloe",
    "contactEmail": "fultonpointe@dominiumapartments.com",
    "suggestedAccountId": "0012A00002D1l2jQAB",
    "suggestedAccountName": "Dominium Management Services (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpTdAAK",
    "contactName": "A'Nessa Hurdle",
    "contactEmail": "gardens.harvestpoint@mvahpartners.com",
    "suggestedAccountId": "001Rh00000KzmfhIAB",
    "suggestedAccountName": "MVAH Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTntlAAC",
    "contactName": "Rachel Johnson",
    "contactEmail": "riverview.bluffs@mvahpartners.com",
    "suggestedAccountId": "001Rh00000KzmfhIAB",
    "suggestedAccountName": "MVAH Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPCuAAO",
    "contactName": "Kim Bruggeman",
    "contactEmail": "riverworks.lofts@mvahpartners.com",
    "suggestedAccountId": "001Rh00000KzmfhIAB",
    "suggestedAccountName": "MVAH Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUEivAAG",
    "contactName": "Brenda Cramer",
    "contactEmail": "summit.pointe@mvahpartners.com",
    "suggestedAccountId": "001Rh00000KzmfhIAB",
    "suggestedAccountName": "MVAH Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPgtAAG",
    "contactName": "Lu Trimble",
    "contactEmail": "gateway@rpmredding.com",
    "suggestedAccountId": "0012A00002D1k2GQAR",
    "suggestedAccountName": "Real Property Management, Inc (Redding)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrRHAA0",
    "contactName": "Erica .",
    "contactEmail": "info@rpmredding.com",
    "suggestedAccountId": "0012A00002D1k2GQAR",
    "suggestedAccountName": "Real Property Management, Inc (Redding)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gToiTAAS",
    "contactName": "Sara Weems",
    "contactEmail": "sunset@rpmredding.com",
    "suggestedAccountId": "0012A00002D1k2GQAR",
    "suggestedAccountName": "Real Property Management, Inc (Redding)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hDuQAI",
    "contactName": "Greg Guttman",
    "contactEmail": "gguttman@macapartments.com",
    "suggestedAccountId": "001F0000018EkA1IAK",
    "suggestedAccountName": "MAC Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTnaGAAS",
    "contactName": "Anne Sansouci",
    "contactEmail": "glenridgegardens@hmrproperties.com",
    "suggestedAccountId": "0012A00002D1ktDQAR",
    "suggestedAccountName": "Housing Management Resources Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hDpQAI",
    "contactName": "Unknown",
    "contactEmail": "google1@mosscompany.com",
    "suggestedAccountId": "0012A00002D1jyDQAR",
    "suggestedAccountName": "Moss & Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0a5AAC",
    "contactName": "Dan Wirth",
    "contactEmail": "govillagesofwildwood@goldoller.com",
    "suggestedAccountId": "0012A00002D1lgfQAB",
    "suggestedAccountName": "GoldOller Real Estate Investments (Philadelphia)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUEbFAAW",
    "contactName": "Kathy Kleine",
    "contactEmail": "kkleine@goldoller.com",
    "suggestedAccountId": "0012A00002D1lgfQAB",
    "suggestedAccountName": "GoldOller Real Estate Investments (Philadelphia)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpCoAAK",
    "contactName": "Chris Noland",
    "contactEmail": "polariscrossingapartments@goldoller.com",
    "suggestedAccountId": "0012A00002D1lgfQAB",
    "suggestedAccountName": "GoldOller Real Estate Investments (Philadelphia)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUObHAAW",
    "contactName": "Christina Abed",
    "contactEmail": "halpine-view@gradymgt.com",
    "suggestedAccountId": "0012A00002D1krlQAB",
    "suggestedAccountName": "Grady Management, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTwZxAAK",
    "contactName": "Alice Dawn Fraley",
    "contactEmail": "harborview@raybrownproperties.com",
    "suggestedAccountId": "0012A0000282X1qQAE",
    "suggestedAccountName": "Ray Brown Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTok8AAC",
    "contactName": "Ashten Jackson",
    "contactEmail": "highlandpark@raybrownproperties.com",
    "suggestedAccountId": "0012A0000282X1qQAE",
    "suggestedAccountName": "Ray Brown Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEWEAA4",
    "contactName": "Tracy Holmes Bell",
    "contactEmail": "hbell@lmha1.org",
    "suggestedAccountId": "0012A00002D1kmFQAR",
    "suggestedAccountName": "Louisville Metro Housing Authority (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUJorAAG",
    "contactName": "Cynthia O'Quain",
    "contactEmail": "hillstone@oldhamgoodwin.com",
    "suggestedAccountId": "001F000001M23fOIAR",
    "suggestedAccountName": "Oldham Goodwin Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvaCAAS",
    "contactName": "Shelby Staples",
    "contactEmail": "shelby.staples@oldhamgoodwin.com",
    "suggestedAccountId": "001F000001M23fOIAR",
    "suggestedAccountName": "Oldham Goodwin Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTokeAAC",
    "contactName": "Amie Oldham",
    "contactEmail": "village.condos@oldhamgoodwin.com",
    "suggestedAccountId": "001F000001M23fOIAR",
    "suggestedAccountName": "Oldham Goodwin Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvImAAK",
    "contactName": "Belanda Hawkins",
    "contactEmail": "huntingtonmgr@onestreetres.com",
    "suggestedAccountId": "0013j000039cH0PAAU",
    "suggestedAccountName": "OneStreet Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gToYHAA0",
    "contactName": "Sarena Harvey",
    "contactEmail": "normanberryvillage@onestreetres.com",
    "suggestedAccountId": "0013j000039cH0PAAU",
    "suggestedAccountName": "OneStreet Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTtGEAA0",
    "contactName": "Gabby Ayers",
    "contactEmail": "winder@onestreetres.com",
    "suggestedAccountId": "0013j000039cH0PAAU",
    "suggestedAccountName": "OneStreet Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPohAAG",
    "contactName": "Ilene Morin",
    "contactEmail": "imorin@nwanchorage.org",
    "suggestedAccountId": "0012A00002D1jdpQAB",
    "suggestedAccountName": "NeighborWorks Alaska (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTyg2AAC",
    "contactName": "Kathy Sutherland",
    "contactEmail": "info@forestproperties.net",
    "suggestedAccountId": "0013j00002dJvZQAA0",
    "suggestedAccountName": "Forest Properties Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTwm1AAC",
    "contactName": "Brandy Connors",
    "contactEmail": "woodedge@forestproperties.net",
    "suggestedAccountId": "0013j00002dJvZQAA0",
    "suggestedAccountName": "Forest Properties Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqOTAA0",
    "contactName": "Ruba Powell",
    "contactEmail": "info@hill-properties.com",
    "suggestedAccountId": "001Rh00000Kzn76IAB",
    "suggestedAccountName": "Hill Properties",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqgWAAS",
    "contactName": "William McAuley",
    "contactEmail": "jackscott@hill-properties.com",
    "suggestedAccountId": "001Rh00000Kzn76IAB",
    "suggestedAccountName": "Hill Properties",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTx9hAAC",
    "contactName": "Michael MacCready",
    "contactEmail": "info@maclamar.com",
    "suggestedAccountId": "0012A00002D1ltlQAB",
    "suggestedAccountName": "Mac Lamar Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gToGdAAK",
    "contactName": "Elizabeth Parker",
    "contactEmail": "info@torprops.com",
    "suggestedAccountId": "0012A00002D1ku6QAB",
    "suggestedAccountName": "Torrington Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEpzAAG",
    "contactName": "Jakob Lotz",
    "contactEmail": "jakob@gobeal.com",
    "suggestedAccountId": "001F000001XJFYDIA5",
    "suggestedAccountName": "Beal Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHBBAA4",
    "contactName": "Keri Caudill",
    "contactEmail": "jasper@rndhouse.com",
    "suggestedAccountId": "0012A00002DTusrQAD",
    "suggestedAccountName": "Roundhouse Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHGLAA4",
    "contactName": "Jazmin Hill",
    "contactEmail": "jhill@rndhouse.com",
    "suggestedAccountId": "0012A00002DTusrQAD",
    "suggestedAccountName": "Roundhouse Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUBagAAG",
    "contactName": "Mary Overstreet",
    "contactEmail": "parkview@rndhouse.com",
    "suggestedAccountId": "0012A00002DTusrQAD",
    "suggestedAccountName": "Roundhouse Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqKKAA0",
    "contactName": "Ashley O'Brien",
    "contactEmail": "thevillage@rndhouse.com",
    "suggestedAccountId": "0012A00002DTusrQAD",
    "suggestedAccountName": "Roundhouse Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEsUAAW",
    "contactName": "John Olszewski",
    "contactEmail": "jeffolszewski@bedrockdetroit.com",
    "suggestedAccountId": "0012A00002D1kwSQAR",
    "suggestedAccountName": "Bedrock Detroit LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEoiAAG",
    "contactName": "Jennifer Pickwick",
    "contactEmail": "jenniferp@lrmanagement.com",
    "suggestedAccountId": "0012A00002D1kvkQAB",
    "suggestedAccountName": "LR Management Services Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AIDyAAO",
    "contactName": "Jennifer Sisson",
    "contactEmail": "jennifers@tescoproperties.com",
    "suggestedAccountId": "0012A00002D1llpQAB",
    "suggestedAccountName": "Tesco Properties, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hB6QAI",
    "contactName": "Jenny Brown",
    "contactEmail": "jenny_brown@kennesaw.edu",
    "suggestedAccountId": "0013j000039cH1LAAU",
    "suggestedAccountName": "KSU Housing Foundation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "003Rh00000XP0coIAD",
    "contactName": "Jeremy Sample",
    "contactEmail": "jeremy.sample@roerscompanies.com",
    "suggestedAccountId": "0012A00002Z49IcQAJ",
    "suggestedAccountName": "Roers Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTy33AAC",
    "contactName": "Jillian Ksiadz",
    "contactEmail": "jillian.ksiadz@ugoc.com",
    "suggestedAccountId": "0013j00002dKBlqAAG",
    "suggestedAccountName": "United Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEZ8AAO",
    "contactName": "Jo'Angela Cooper Scott",
    "contactEmail": "joangela.scott@kcgcompanies.com",
    "suggestedAccountId": "0013j000039cHEdAAM",
    "suggestedAccountName": "KCG Companies, Inc.",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AERtAAO",
    "contactName": "Tina Waggoner",
    "contactEmail": "tina.waggoner@kcgcompanies.com",
    "suggestedAccountId": "0013j000039cHEdAAM",
    "suggestedAccountName": "KCG Companies, Inc.",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003ipWAqAAM",
    "contactName": "Jon Westrom",
    "contactEmail": "jon@westromgroup.com",
    "suggestedAccountId": "0012A00002D1m7QQAR",
    "suggestedAccountName": "Westrom Group",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "003F000001MsotFIAR",
    "contactName": "Jennifer Oppriecht",
    "contactEmail": "joppriecht@stevebrownapts.com",
    "suggestedAccountId": "001F0000012O9GvIAK",
    "suggestedAccountName": "Steve Brown Apartments (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpy6AAC",
    "contactName": "Cheeri Beasley",
    "contactEmail": "josha.hernandez@itexgrp.com",
    "suggestedAccountId": "0013j00003Hk05cAAB",
    "suggestedAccountName": "Itex Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUKKIAA4",
    "contactName": "Brooke .",
    "contactEmail": "labellevie@itexgrp.com",
    "suggestedAccountId": "0013j00003Hk05cAAB",
    "suggestedAccountName": "Itex Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqFHAA0",
    "contactName": "Marsha Grimes",
    "contactEmail": "oakleaf@itexgrp.com",
    "suggestedAccountId": "0013j00003Hk05cAAB",
    "suggestedAccountName": "Itex Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUOaTAAW",
    "contactName": "Esther Scarborough",
    "contactEmail": "pinesatallen@itexgrp.com",
    "suggestedAccountId": "0013j00003Hk05cAAB",
    "suggestedAccountName": "Itex Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUBfmAAG",
    "contactName": "Jasmine Johnson",
    "contactEmail": "thecarlyle@itexgrp.com",
    "suggestedAccountId": "0013j00003Hk05cAAB",
    "suggestedAccountName": "Itex Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPuoAAG",
    "contactName": "Judith Johns",
    "contactEmail": "velmajeter@itexgrp.com",
    "suggestedAccountId": "0013j00003Hk05cAAB",
    "suggestedAccountName": "Itex Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzhYAAS",
    "contactName": "Donna Martin",
    "contactEmail": "virginiaestates@itexgrp.com",
    "suggestedAccountId": "0013j00003Hk05cAAB",
    "suggestedAccountName": "Itex Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTsoyAAC",
    "contactName": "Stephanie Mccrea",
    "contactEmail": "willowbend@itexgrp.com",
    "suggestedAccountId": "0013j00003Hk05cAAB",
    "suggestedAccountName": "Itex Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTwxkAAC",
    "contactName": "J Taylor",
    "contactEmail": "jtaylor@livenovo.com",
    "suggestedAccountId": "0012A00002D1kKlQAJ",
    "suggestedAccountName": "NOVO Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUJxsAAG",
    "contactName": "Shay Allen",
    "contactEmail": "kallen@sinatraandcompany.com",
    "suggestedAccountId": "0012A00002D1lM8QAJ",
    "suggestedAccountName": "Sinatra & Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTv7pAAC",
    "contactName": "Kathi Price",
    "contactEmail": "kathi.p@greenwoodstar.net",
    "suggestedAccountId": "0012A00002UkDO3QAN",
    "suggestedAccountName": "Greenwood Star",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPV1AAO",
    "contactName": "Cecillia Ledford",
    "contactEmail": "kaylean.kier@jlgray.com",
    "suggestedAccountId": "0012A00002D1lEvQAJ",
    "suggestedAccountName": "JL Gray Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "003F000001S5FO2IAN",
    "contactName": "Katie Beam",
    "contactEmail": "kbeam@epicity.com",
    "suggestedAccountId": "0012A00002D1kV6QAJ",
    "suggestedAccountName": "Epicity Real Estate (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHeIAAW",
    "contactName": "Kelli Dobner",
    "contactEmail": "kdobn@samaritas.org",
    "suggestedAccountId": "0012A00002D1kv9QAB",
    "suggestedAccountName": "Samaritas (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUOmlAAG",
    "contactName": "Kristy .",
    "contactEmail": "keith@equitybcs.com",
    "suggestedAccountId": "001F000001MIeBzIAL",
    "suggestedAccountName": "Equity Real Estate (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEVLAA4",
    "contactName": "Keith Long",
    "contactEmail": "keith@whlong.com",
    "suggestedAccountId": "0012A00002BfaQUQAZ",
    "suggestedAccountName": "W. H. Long Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEXWAA4",
    "contactName": "Kelsey Talbot",
    "contactEmail": "kelsey@whlong.com",
    "suggestedAccountId": "0012A00002BfaQUQAZ",
    "suggestedAccountName": "W. H. Long Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvrbAAC",
    "contactName": "Kelly Hammock",
    "contactEmail": "kelly.hammock@bsrreit.com",
    "suggestedAccountId": "0012A00002D1jo0QAB",
    "suggestedAccountName": "BSR Reit LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvJnAAK",
    "contactName": "Brittney Jackson",
    "contactEmail": "kensingtonpm@leuvengroup.com",
    "suggestedAccountId": "0012A00002WAiGjQAL",
    "suggestedAccountName": "Leuven Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUEEJAA4",
    "contactName": "Keturah Troy",
    "contactEmail": "keturah.troy@pmresi.com",
    "suggestedAccountId": "0013j00001tKv02AAC",
    "suggestedAccountName": "PM Residential Management, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTncfAAC",
    "contactName": "Kim Wright",
    "contactEmail": "kimberly.white@paragonresidential.com",
    "suggestedAccountId": "0012A00002D1lMSQAZ",
    "suggestedAccountName": "Paragon Residential Management, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEaQAAW",
    "contactName": "Katie Eskew",
    "contactEmail": "kle@communityms.net",
    "suggestedAccountId": "0012A00002D1kgIQAR",
    "suggestedAccountName": "Community Management Services, Inc (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEW4AAO",
    "contactName": "Steffany Stoeffler",
    "contactEmail": "sbs@communityms.net",
    "suggestedAccountId": "0012A00002D1kgIQAR",
    "suggestedAccountName": "Community Management Services, Inc (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTtItAAK",
    "contactName": "Krystal Lennon",
    "contactEmail": "klennon@hmgmt.com",
    "suggestedAccountId": "0013j000039cHLEAA2",
    "suggestedAccountName": "Hirschfeld Management, Inc. (White Marsh)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTGT9AAO",
    "contactName": "Kelli Jo Norris",
    "contactEmail": "knorris@goodmanre.com",
    "suggestedAccountId": "0012A00002D1qS1QAJ",
    "suggestedAccountName": "Goodman Real Estate   (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpg5AAC",
    "contactName": "Kirsten Powers",
    "contactEmail": "kpowers@heritageprop.net",
    "suggestedAccountId": "0013j00002brQdQAAU",
    "suggestedAccountName": "Heritage Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxmtAAC",
    "contactName": "Amanda Marcus",
    "contactEmail": "waterheadleasing@heritageprop.net",
    "suggestedAccountId": "0013j00002brQdQAAU",
    "suggestedAccountName": "Heritage Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEtcAAG",
    "contactName": "Kara Powers",
    "contactEmail": "kpowers@jslmi.org",
    "suggestedAccountId": "0012A00002D1kz4QAB",
    "suggestedAccountName": "Jewish Senior Life Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEXlAAO",
    "contactName": "Kristina Blackmon",
    "contactEmail": "kris.blackmon@advantixcorp.com",
    "suggestedAccountId": "0013j00002zifXlAAI",
    "suggestedAccountName": "Advantix Development Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AIUVAA4",
    "contactName": "Kristen Pool",
    "contactEmail": "kristen.pool@g-b.com",
    "suggestedAccountId": "0012A00002D1mG9QAJ",
    "suggestedAccountName": "Goodale & Barbieri Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003YL5eLAAT",
    "contactName": "Kurt Borrud",
    "contactEmail": "kurt@goldleafdevelopment.com",
    "suggestedAccountId": "001F0000012O983IAC",
    "suggestedAccountName": "Goldleaf Development (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEppAAG",
    "contactName": "Kenneth Werth",
    "contactEmail": "kwerth@stratfordgroupltd.com",
    "suggestedAccountId": "0012A00002D1kwNQAR",
    "suggestedAccountName": "Stratford Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AGf5AAG",
    "contactName": "Todd Libka",
    "contactEmail": "tlibka@stratfordgroupltd.com",
    "suggestedAccountId": "0012A00002D1kwNQAR",
    "suggestedAccountName": "Stratford Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxW9AAK",
    "contactName": "Dan Bohler",
    "contactEmail": "lauren@cvillage.com",
    "suggestedAccountId": "0013j00002zjHTiAAM",
    "suggestedAccountName": "Celebration Village",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTsXHAA0",
    "contactName": "Roslyn Dunn",
    "contactEmail": "leasing_creldorado@trinitymultifamily.com",
    "suggestedAccountId": "0012A00002D1jntQAB",
    "suggestedAccountName": "Asset Living (Fort Smith)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpGzAAK",
    "contactName": "Callie Venable",
    "contactEmail": "manager_gma@trinitymultifamily.com",
    "suggestedAccountId": "0012A00002D1jntQAB",
    "suggestedAccountName": "Asset Living (Fort Smith)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTr3lAAC",
    "contactName": "Jennifer Colon",
    "contactEmail": "leasingfoundry@liverangewater.com",
    "suggestedAccountId": "001F000001GXHEkIAP",
    "suggestedAccountName": "RangeWater Real Estate (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUOZTAA4",
    "contactName": "Eric Romaniecki",
    "contactEmail": "leasingmarlborough@pancomgt.com",
    "suggestedAccountId": "0012A00002D1lDpQAJ",
    "suggestedAccountName": "Panco Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqbCAAS",
    "contactName": "Ty Young",
    "contactEmail": "pmstoughton@pancomgt.com",
    "suggestedAccountId": "0012A00002D1lDpQAJ",
    "suggestedAccountName": "Panco Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPyVAAW",
    "contactName": "Shakira Jones",
    "contactEmail": "leasingsidney@worthingse.com",
    "suggestedAccountId": "001F000001GXHKZIA5",
    "suggestedAccountName": "The Worthing Companies",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxwyAAC",
    "contactName": "Christina Willingham",
    "contactEmail": "leasingwoodstock@worthingse.com",
    "suggestedAccountId": "001F000001GXHKZIA5",
    "suggestedAccountName": "The Worthing Companies",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003u2SxDAAU",
    "contactName": "Legal",
    "contactEmail": "legal@bronzevillevincennes.com",
    "suggestedAccountId": "0013j000036VpdVAAS",
    "suggestedAccountName": "The Bronzeville Vincennes",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxicAAC",
    "contactName": "Lauren Galuski",
    "contactEmail": "lgaluski@harmony-group.com",
    "suggestedAccountId": "0012A00002D1lKtQAJ",
    "suggestedAccountName": "Harmony Group Capital, LLC",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AESlAAO",
    "contactName": "Linda O'Neill",
    "contactEmail": "linda.oneill@greencroft.org",
    "suggestedAccountId": "0012A00002D1kgoQAB",
    "suggestedAccountName": "Greencroft Communities (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUIqmAAG",
    "contactName": "Stephanie Spoerl",
    "contactEmail": "links.columbia@lindseymanagement.com",
    "suggestedAccountId": "0012A00002D1jnQQAR",
    "suggestedAccountName": "Lindsey Management Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUK3JAAW",
    "contactName": "Melody Paige",
    "contactEmail": "liveoak@irtliving.com",
    "suggestedAccountId": "0012A00002D1lfNQAR",
    "suggestedAccountName": "Independence Realty Trust",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTyPQAA0",
    "contactName": "Lauren Lenox",
    "contactEmail": "llenox@jonesstreet.com",
    "suggestedAccountId": "001Rh00000KzmZ9IAJ",
    "suggestedAccountName": "Jones Street Investment Partners",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041ADyKAAW",
    "contactName": "Lucinda Herring Parsons",
    "contactEmail": "lparsons@ahepahousing.org",
    "suggestedAccountId": "0012A00002D1kfTQAR",
    "suggestedAccountName": "AHEP National Housing Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AESgAAO",
    "contactName": "Tracy Storts",
    "contactEmail": "tstorts@ahepahousing.org",
    "suggestedAccountId": "0012A00002D1kfTQAR",
    "suggestedAccountName": "AHEP National Housing Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrcbAAC",
    "contactName": "Laura Petronchak",
    "contactEmail": "lpetronchak@eaglerockmanagement.com",
    "suggestedAccountId": "0012A00002D1qU0QAJ",
    "suggestedAccountName": "Eagle Rock Management (Plainview)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzasAAC",
    "contactName": "Tori Reed",
    "contactEmail": "maddenspointe@hometeamproperties.net",
    "suggestedAccountId": "0012A00002D1lUYQAZ",
    "suggestedAccountName": "Hometeam Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqmQAAS",
    "contactName": "Marisa Smith",
    "contactEmail": "wilsonplace@hometeamproperties.net",
    "suggestedAccountId": "0012A00002D1lUYQAZ",
    "suggestedAccountName": "Hometeam Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvESAA0",
    "contactName": "Kris Miles",
    "contactEmail": "madison@seniorhousingoptions.org",
    "suggestedAccountId": "0013j00002ziYXEAA2",
    "suggestedAccountName": "Senior Housing Options, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTyxSAAS",
    "contactName": "Malik Shabazz",
    "contactEmail": "malik@mscinvestment.com",
    "suggestedAccountId": "0012A00002D1kUgQAJ",
    "suggestedAccountName": "MSC Investments (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTnPmAAK",
    "contactName": "Charminique Ray",
    "contactEmail": "managercm@grtpm.com",
    "suggestedAccountId": "0013j000039cGVXAA2",
    "suggestedAccountName": "GRT Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxbiAAC",
    "contactName": "Courtney Daily",
    "contactEmail": "twincreek@grtpm.com",
    "suggestedAccountId": "0013j000039cGVXAA2",
    "suggestedAccountName": "GRT Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003OQzCFAA1",
    "contactName": "Mark Baladez",
    "contactEmail": "marbal@mwhsolutions.org",
    "suggestedAccountId": "0012A00002D1kHvQAJ",
    "suggestedAccountName": "Metro West Housing Solutions (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEU8AAO",
    "contactName": "Margaret Buisson",
    "contactEmail": "margaret@buissoninvestment.com",
    "suggestedAccountId": "0012A00002D1klDQAR",
    "suggestedAccountName": "Buisson Investment Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEZXAA4",
    "contactName": "Mark Webb",
    "contactEmail": "mark.webb@cfcproperties.com",
    "suggestedAccountId": "001F000001SUxYsIAL",
    "suggestedAccountName": "CFC Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0f5AAC",
    "contactName": "Myers Boicourt",
    "contactEmail": "mboicourt@berkshireresi.com",
    "suggestedAccountId": "0013j000039cGRnAAM",
    "suggestedAccountName": "Berkshire Residential Investments (San Francisco)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AESbAAO",
    "contactName": "Michael Davidowitz",
    "contactEmail": "mdavidowitz@svequities.com",
    "suggestedAccountId": "0013j000034JEIwAAO",
    "suggestedAccountName": "Soundview Equities LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AETjAAO",
    "contactName": "Michael Drew",
    "contactEmail": "mdrew@bradleyco.com",
    "suggestedAccountId": "0012A00002D1kf3QAB",
    "suggestedAccountName": "Bradley Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEa1AAG",
    "contactName": "Matt Schramm",
    "contactEmail": "mschramm@bradleyco.com",
    "suggestedAccountId": "0012A00002D1kf3QAB",
    "suggestedAccountName": "Bradley Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0agAAC",
    "contactName": "Shoshana Strong",
    "contactEmail": "meadowview@eenhoorn.com",
    "suggestedAccountId": "0012A00002D1kxeQAB",
    "suggestedAccountName": "Eenhoorn, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hDwQAI",
    "contactName": "Megan Kowalsky",
    "contactEmail": "megan.kowalsky@metropolitanamerica.com",
    "suggestedAccountId": "0012A00002D1lBYQAZ",
    "suggestedAccountName": "Metropolitan America (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTopeAAC",
    "contactName": "Melissa Skorupa",
    "contactEmail": "melissa@geisproperties.com",
    "suggestedAccountId": "0013j00002uCw2SAAS",
    "suggestedAccountName": "Geis Property Management LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTnfsAAC",
    "contactName": "Latisha Lattimore",
    "contactEmail": "mgr-trinitytower@capreit.com",
    "suggestedAccountId": "0012A00002D1kqcQAB",
    "suggestedAccountName": "CAPREIT Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTs5hAAC",
    "contactName": "Latifa Williams",
    "contactEmail": "waldenpark@capreit.com",
    "suggestedAccountId": "0012A00002D1kqcQAB",
    "suggestedAccountName": "CAPREIT Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTylpAAC",
    "contactName": "Brittany Thorpe",
    "contactEmail": "mgrhv@provencere.com",
    "suggestedAccountId": "0012A00002D1kStQAJ",
    "suggestedAccountName": "Provence Real Estate (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPO8AAO",
    "contactName": "Stephanie Felts",
    "contactEmail": "sm@provencere.com",
    "suggestedAccountId": "0012A00002D1kStQAJ",
    "suggestedAccountName": "Provence Real Estate (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTt6oAAC",
    "contactName": "Madeline Hunt",
    "contactEmail": "mhunt@kriproperties.com",
    "suggestedAccountId": "0012A00002D1lTSQAZ",
    "suggestedAccountName": "KRI Properties, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hE1QAI",
    "contactName": "Michelle Fargen",
    "contactEmail": "michelle@primeurbanproperties.com",
    "suggestedAccountId": "001F0000019Esk0IAC",
    "suggestedAccountName": "Prime Urban Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUKRXAA4",
    "contactName": "Letitia Allen",
    "contactEmail": "montrosesquare@linkapm.com",
    "suggestedAccountId": "0012A00002D1lXUQAZ",
    "suggestedAccountName": "Link Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003u2ZtFAAU",
    "contactName": "Manuel Vega",
    "contactEmail": "mvega@respropmanagement.com",
    "suggestedAccountId": "0013j00001tKrnKAAS",
    "suggestedAccountName": "ResProp Management",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEyIAAW",
    "contactName": "Mike Wotring",
    "contactEmail": "mwotring@independencevillages.com",
    "suggestedAccountId": "0012A00002D1kvYQAR",
    "suggestedAccountName": "Story Point Senior Living (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzyMAAS",
    "contactName": "Nicole Forkey",
    "contactEmail": "nicole@518renter.com",
    "suggestedAccountId": "0013j00002zjLS5AAM",
    "suggestedAccountName": "Real Capital Group LLC",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUJ78AAG",
    "contactName": "Kristen Franklin",
    "contactEmail": "nineeast33rd@cocm.com",
    "suggestedAccountId": "0013j00002zjHW3AAM",
    "suggestedAccountName": "Capstone on Campus Management, LLC (Vestavia Hills)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTxgpAAC",
    "contactName": "Todd Brennan",
    "contactEmail": "northdeering@harbormgmt.com",
    "suggestedAccountId": "0012A00002D1ktCQAR",
    "suggestedAccountName": "Harbor Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003ke8J2AAI",
    "contactName": "Nicole Williams",
    "contactEmail": "nwilliams@amgnevada.com",
    "suggestedAccountId": "0012A00002D1l95QAB",
    "suggestedAccountName": "Advanced Management Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "003F000001grDiHIAU",
    "contactName": "OAKPARK",
    "contactEmail": "oakpark@coachlightcommunities.com",
    "suggestedAccountId": "001F000001GXHNcIAP",
    "suggestedAccountName": "Coachlight Communities, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzfNAAS",
    "contactName": "Dorian Sampson",
    "contactEmail": "oakwoodmanager@ymcorp.com",
    "suggestedAccountId": "0013j000039cHGrAAM",
    "suggestedAccountName": "Young Management Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUQ8HAAW",
    "contactName": "Caitlin Bishop",
    "contactEmail": "onenorth@dolben.com",
    "suggestedAccountId": "0012A00002D1kthQAB",
    "suggestedAccountName": "Dolben Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTp1GAAS",
    "contactName": "Jesse Allen",
    "contactEmail": "stockbridge@dolben.com",
    "suggestedAccountId": "0012A00002D1kthQAB",
    "suggestedAccountName": "Dolben Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTuBpAAK",
    "contactName": "Teaghan Costello",
    "contactEmail": "strata@dolben.com",
    "suggestedAccountId": "0012A00002D1kthQAB",
    "suggestedAccountName": "Dolben Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0gzAAC",
    "contactName": "Becky Mintz",
    "contactEmail": "parkridgegardens@promarkpartners.com",
    "suggestedAccountId": "0013j00002dK5qcAAC",
    "suggestedAccountName": "Promark Partners (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTnKCAA0",
    "contactName": "Tricia Ginther",
    "contactEmail": "pembrookecourt@edgproperties.net",
    "suggestedAccountId": "0013j000039cIDDAA2",
    "suggestedAccountName": "Pinnacle Homestead Management Inc (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002Xq5smQAB",
    "contactName": "Lauren Orsi",
    "contactEmail": "peonyvillage@roberthancockco.com",
    "suggestedAccountId": "001F000001lp4YMIAY",
    "suggestedAccountName": "Robert Hancock & Co. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTqzTAAS",
    "contactName": "Patricia Amador",
    "contactEmail": "pfc@covenantpropertyservices.com",
    "suggestedAccountId": "0012A00002D1ljzQAB",
    "suggestedAccountName": "Covenant Property Services",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041A7cxAAC",
    "contactName": "Paul Grachev",
    "contactEmail": "pgrachev@zidans.com",
    "suggestedAccountId": "0013j00002dMkbaAAC",
    "suggestedAccountName": "Zidan Management Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTz8WAAS",
    "contactName": "Markesha Paddio",
    "contactEmail": "pinhook@gmfonline.org",
    "suggestedAccountId": "001Rh00000KzmjVIAR",
    "suggestedAccountName": "Global Ministries Fellowship",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTrWrAAK",
    "contactName": "Bobbie Mier",
    "contactEmail": "pm.parkplaza@tarantino.com",
    "suggestedAccountId": "0012A00002D1lsxQAB",
    "suggestedAccountName": "Tarantino Properties, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpUjAAK",
    "contactName": "Melissa Shaw",
    "contactEmail": "pm.thelanding@tarantino.com",
    "suggestedAccountId": "0012A00002D1lsxQAB",
    "suggestedAccountName": "Tarantino Properties, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "003Rh00000XP08VIAT",
    "contactName": "Preston Henderson",
    "contactEmail": "preston@titancorpus.com",
    "suggestedAccountId": "0012A00002D1ljkQAB",
    "suggestedAccountName": "Titan Corp (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTnUcAAK",
    "contactName": "Elys Rodriguez",
    "contactEmail": "propertyadmin@franchimanagement.com",
    "suggestedAccountId": "0012A00002D1ksaQAB",
    "suggestedAccountName": "Franchi Management Company, Inc (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUBOkAAO",
    "contactName": "Jenna Wilkinson",
    "contactEmail": "proximitynorthlake@allresco.com",
    "suggestedAccountId": "0013j000039cGRkAAM",
    "suggestedAccountName": "Alliance Residential Company",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003FeifKAAR",
    "contactName": "Stacey White",
    "contactEmail": "swhite@allresco.com",
    "suggestedAccountId": "0013j000039cGRkAAM",
    "suggestedAccountName": "Alliance Residential Company",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHCdAAO",
    "contactName": "Alana Creamer",
    "contactEmail": "rabitbrushrun@ismrem.com",
    "suggestedAccountId": "0012A00002D1k6fQAB",
    "suggestedAccountName": "ISM Management Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHdAAAW",
    "contactName": "Rashida Grant",
    "contactEmail": "rashida.grant@csi.coop",
    "suggestedAccountId": "0012A00002D1kvpQAB",
    "suggestedAccountName": "CSI Support & Development (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUK9yAAG",
    "contactName": "Roblyn Bailey",
    "contactEmail": "rbailey@hadler.com",
    "suggestedAccountId": "0013j000039cHsPAAU",
    "suggestedAccountName": "Hadler Real Estate Management, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0PbAAK",
    "contactName": "Jo Potts",
    "contactEmail": "rdemgr@amlapts.com",
    "suggestedAccountId": "0013j000039cGM9AAM",
    "suggestedAccountName": "Associated Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvPlAAK",
    "contactName": "Bobbie Moore",
    "contactEmail": "wbkmgr@amlapts.com",
    "suggestedAccountId": "0013j000039cGM9AAM",
    "suggestedAccountName": "Associated Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEYUAA4",
    "contactName": "Rob Dury",
    "contactEmail": "rdury@houseinvestments.com",
    "suggestedAccountId": "0013j00003Hk08EAAR",
    "suggestedAccountName": "House Investments (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hDsQAI",
    "contactName": "Unknown",
    "contactEmail": "rfountain@rockfordconstruction.com",
    "suggestedAccountId": "0012A00002D1kyQQAR",
    "suggestedAccountName": "Rockford Construction (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0haAAC",
    "contactName": "Nicole Baer",
    "contactEmail": "riverbendapts@bipinc.com",
    "suggestedAccountId": "001F000001GXHEyIAP",
    "suggestedAccountName": "Brown Investment Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTwwGAAS",
    "contactName": "Jacquelyn McClellan",
    "contactEmail": "riverviewcalallen@mayfairmgt.com",
    "suggestedAccountId": "0012A00002D1iKfQAJ",
    "suggestedAccountName": "Mayfair Management Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvJ3AAK",
    "contactName": "Claudia Gibson",
    "contactEmail": "riverwalk.mgr@apg-inc.com",
    "suggestedAccountId": "0012A00002D1kVBQAZ",
    "suggestedAccountName": "Alexander Properties Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002dUDCtQAO",
    "contactName": "Robert McComb",
    "contactEmail": "rmccomb@hmre.net",
    "suggestedAccountId": "0012A00002D1kI8QAJ",
    "suggestedAccountName": "Henderson Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003u01OGAAY",
    "contactName": "Robert Dunn",
    "contactEmail": "robert.dunn@fairstead.com",
    "suggestedAccountId": "0013j00002zjHQ5AAM",
    "suggestedAccountName": "Fairstead (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003u08AQAAY",
    "contactName": "Yehuda Kestenbaum",
    "contactEmail": "yehuda.kestenbaum@fairstead.com",
    "suggestedAccountId": "0013j00002zjHQ5AAM",
    "suggestedAccountName": "Fairstead (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AES2AAO",
    "contactName": "Robin Davis",
    "contactEmail": "robin@blackburnpropertymgt.com",
    "suggestedAccountId": "0013j00002zjLSbAAM",
    "suggestedAccountName": "Blackburn Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTtT2AAK",
    "contactName": "Kristin Roberts",
    "contactEmail": "rocksprings@gables.com",
    "suggestedAccountId": "001F000001GXHGFIA5",
    "suggestedAccountName": "Gables Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUEQvAAO",
    "contactName": "Kryssi Etheridge",
    "contactEmail": "urbangreen@gables.com",
    "suggestedAccountId": "001F000001GXHGFIA5",
    "suggestedAccountName": "Gables Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0knAAC",
    "contactName": "Candi Diemer",
    "contactEmail": "westavenue@gables.com",
    "suggestedAccountId": "001F000001GXHGFIA5",
    "suggestedAccountName": "Gables Residential (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00002NMGOMAA5",
    "contactName": "Ron Wenzel",
    "contactEmail": "rwenzel@grailmanagementgroup.com",
    "suggestedAccountId": "0012A00002D1kRlQAJ",
    "suggestedAccountName": "Grail Management Group (Orlando)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041A6lVAAS",
    "contactName": "Ryan Lausten",
    "contactEmail": "ryanl@burkhalterinc.com",
    "suggestedAccountId": "0013j000039cGMAAA2",
    "suggestedAccountName": "Burkhalter Commercial Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003q4CxFAAU",
    "contactName": "Sam unknown",
    "contactEmail": "sam@mcmprop.com",
    "suggestedAccountId": "0012A00002D1k0EQAR",
    "suggestedAccountName": "MCM Property Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTovEAAS",
    "contactName": "Samantha Loveday",
    "contactEmail": "samantha@csregroup.com",
    "suggestedAccountId": "0013j00002uBRMSAA4",
    "suggestedAccountName": "CSRE Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTujkAAC",
    "contactName": "Stephanie Cook",
    "contactEmail": "sawyerflats@thrivecommunities.com",
    "suggestedAccountId": "0012A00002AM0uLQAT",
    "suggestedAccountName": "Thrive Communities, LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTKiQAAW",
    "contactName": "Shane Davis",
    "contactEmail": "sdavis@nwrecc.org",
    "suggestedAccountId": "0012A00002D1kYeQAJ",
    "suggestedAccountName": "Northwest Real Estate Capital Corp. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003yqlysAAA",
    "contactName": "Stacey Foo",
    "contactEmail": "sfoo@irvinecompany.com",
    "suggestedAccountId": "0012A00002D1k7lQAB",
    "suggestedAccountName": "Irvine Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "003F000001eux8hIAA",
    "contactName": "Stephen Gilbert",
    "contactEmail": "sgilbert@gateshudson.com",
    "suggestedAccountId": "0012A00002D1mCFQAZ",
    "suggestedAccountName": "Gates Hudson  (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUOezAAG",
    "contactName": "Stephani Golie",
    "contactEmail": "sgolie@rcmseniorliving.com",
    "suggestedAccountId": "0012A00002D1lxYQAR",
    "suggestedAccountName": "The Aspenwood Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AERsAAO",
    "contactName": "Shana Strossner",
    "contactEmail": "shana.strossner@homeisjchart.com",
    "suggestedAccountId": "001F000001GXHZpIAP",
    "suggestedAccountName": "J.C. Hart Company, Inc (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AETFAA4",
    "contactName": "Sherri Toohey Taylor",
    "contactEmail": "sherri.toohey-taylor@havenresidential.com",
    "suggestedAccountId": "0013j000036UU46AAG",
    "suggestedAccountName": "Haven Residential",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTwtLAAS",
    "contactName": "Sherry Randall",
    "contactEmail": "sherry@bonnercarrington.com",
    "suggestedAccountId": "0012A00002D1m3mQAB",
    "suggestedAccountName": "Bonner Carrington (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "003Rh00000XP0lIIAT",
    "contactName": "Jamie Springer",
    "contactEmail": "springerj@optima.inc",
    "suggestedAccountId": "0013j00002z5aGxAAI",
    "suggestedAccountName": "Optima, Inc.",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTs5HAAS",
    "contactName": "Rita Griffin",
    "contactEmail": "springvalley@wellingtonadvisors.com",
    "suggestedAccountId": "0012A000021ABwPQAW",
    "suggestedAccountName": "Wellington Advisors (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHKmAAO",
    "contactName": "Lauren Harvey",
    "contactEmail": "srhorizonsilverlake@tmo.com",
    "suggestedAccountId": "0012A00002D1lBkQAJ",
    "suggestedAccountName": "The Michaels Organization (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHLLAA4",
    "contactName": "Jennifer Liriano",
    "contactEmail": "themillonmain@tmo.com",
    "suggestedAccountId": "0012A00002D1lBkQAJ",
    "suggestedAccountName": "The Michaels Organization (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003ze3KlAAI",
    "contactName": "Stephenie Bursey",
    "contactEmail": "stephenie@ca-mgmt.com",
    "suggestedAccountId": "0012A00002D1jmLQAR",
    "suggestedAccountName": "Chamberlin & Associates",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTtozAAC",
    "contactName": "Sonia Durgin",
    "contactEmail": "summervillestation@prgrealestate.com",
    "suggestedAccountId": "001F000001GXHFTIA5",
    "suggestedAccountName": "PRG Real Estate Management (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hC2QAI",
    "contactName": "Katie Williams",
    "contactEmail": "support@rentlinx.com",
    "suggestedAccountId": "0012A00002D1kkYQAR",
    "suggestedAccountName": "AV Homes LLC (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTnrjAAC",
    "contactName": "Terri Coit",
    "contactEmail": "tcoit@wny.twcbc.com",
    "suggestedAccountId": "0013j000039cJZJAA2",
    "suggestedAccountName": "Carlisle Apartments, Inc. (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvKyAAK",
    "contactName": "Jackie .",
    "contactEmail": "tftitzsimmons@zgproperties.com",
    "suggestedAccountId": "0012A00002D1lRlQAJ",
    "suggestedAccountName": "ZG Properties (Pepper Pike)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTt7XAAS",
    "contactName": "Brandi Rominski",
    "contactEmail": "webcontacttp@zgproperties.com",
    "suggestedAccountId": "0012A00002D1lRlQAJ",
    "suggestedAccountName": "ZG Properties (Pepper Pike)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTnceAAC",
    "contactName": "Jon .",
    "contactEmail": "thecreswell@daladgroup.com",
    "suggestedAccountId": "0012A00002D1lTuQAJ",
    "suggestedAccountName": "Dalad Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTuryAAC",
    "contactName": "Jana Nicolosi",
    "contactEmail": "thenormandy@druckerandfalk.com",
    "suggestedAccountId": "0012A00002D1lQWQAZ",
    "suggestedAccountName": "Drucker + Falk",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTx2UAAS",
    "contactName": "Monica Estrada",
    "contactEmail": "thepointe@triarcrep.com",
    "suggestedAccountId": "0013j000039cIM3AAM",
    "suggestedAccountName": "TriArc Real Estate Partners (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hEEQAY",
    "contactName": "Tina Wilson",
    "contactEmail": "tinaw@ogdenre.com",
    "suggestedAccountId": "001F0000012O9GyIAK",
    "suggestedAccountName": "Ogden & Company (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A00002b6hDrQAI",
    "contactName": "T Johnson",
    "contactEmail": "tjohnson@intrepidpg.com",
    "suggestedAccountId": "0012A00002D1kyeQAB",
    "suggestedAccountName": "Intrepid Professional Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEsoAAG",
    "contactName": "Tyler Overfield",
    "contactEmail": "toverfield@oxfordcompanies.com",
    "suggestedAccountId": "0012A00001ytKWJQA2",
    "suggestedAccountName": "Oxford Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AEpGAAW",
    "contactName": "Wonwoo Lee",
    "contactEmail": "wlee@oxfordcompanies.com",
    "suggestedAccountId": "0012A00001ytKWJQA2",
    "suggestedAccountName": "Oxford Companies (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvaWAAS",
    "contactName": "Tracy Richardson",
    "contactEmail": "tracy.richardson@aamci.com",
    "suggestedAccountId": "0012A00002D1lmyQAB",
    "suggestedAccountName": "American Apartment Management Company Inc (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0032A000039MwfmQAC",
    "contactName": "Brian Schwarz",
    "contactEmail": "triggin@csmcorp.net",
    "suggestedAccountId": "001F00000147aY7IAI",
    "suggestedAccountName": "CSM Corporation (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTzlsAAC",
    "contactName": "Shimerre Scott",
    "contactEmail": "villageofcollegepark@reliantrs.com",
    "suggestedAccountId": "0012A00002D1qSyQAJ",
    "suggestedAccountName": "Paths Management Services (New York)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUEgsAAG",
    "contactName": "Cindy Selle",
    "contactEmail": "villasierramadre@archdiocesanhousing.org",
    "suggestedAccountId": "0012A00002D1kGDQAZ",
    "suggestedAccountName": "Catholic Charities Housing  (Denver)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0J3AAK",
    "contactName": "Noelle Brockway",
    "contactEmail": "villasleasing@ovationprop.com",
    "suggestedAccountId": "001F000001GXHFdIAP",
    "suggestedAccountName": "Ovation Realty Management LLC (Tampa)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gToRSAA0",
    "contactName": "Carrie Lupica",
    "contactEmail": "vineeastapts@rhmrealestategroup.com",
    "suggestedAccountId": "0012A00002D1lVsQAJ",
    "suggestedAccountName": "RHM Real Estate Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU0a9AAC",
    "contactName": "Allison Reed",
    "contactEmail": "vinings@ecigroups.com",
    "suggestedAccountId": "0012A00002D1kWLQAZ",
    "suggestedAccountName": "ECI Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gSyg2AAC",
    "contactName": "Westcott Shaw",
    "contactEmail": "westcott@h2realestate.com",
    "suggestedAccountId": "001F000001OSqkpIAD",
    "suggestedAccountName": "H2 Real Estate (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpyNAAS",
    "contactName": "Nicole Fairchild",
    "contactEmail": "williamsburgleasing@beztak.com",
    "suggestedAccountId": "0012A00002D1kvrQAB",
    "suggestedAccountName": "Beztak Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gUPw0AAG",
    "contactName": "Katrina Whimper",
    "contactEmail": "windwardforest@kencoapartments.com",
    "suggestedAccountId": "0012A00002D1kTaQAJ",
    "suggestedAccountName": "Kenco Apartment Communities (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gU6LBAA0",
    "contactName": "Yessica Martinez",
    "contactEmail": "woodland@nelkinrealestate.com",
    "suggestedAccountId": "0012A00002D1kSlQAJ",
    "suggestedAccountName": "Nelkin Real Estate (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTvWYAA0",
    "contactName": "Ashley Lobl",
    "contactEmail": "woodlandhill@harvest-properties.com",
    "suggestedAccountId": "0012A00002D1kJ7QAJ",
    "suggestedAccountName": "Harvest Properties (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003gTpfaAAC",
    "contactName": "Lisa Murphy",
    "contactEmail": "worthingtonwoodsmgr@tricapres.com",
    "suggestedAccountId": "001F000001GXHHVIA5",
    "suggestedAccountName": "Tricap Residential Group (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j000041AHfuAAG",
    "contactName": "Yovan Luyt",
    "contactEmail": "yluyt@americanhouse.com",
    "suggestedAccountId": "0012A00002D1kwuQAB",
    "suggestedAccountName": "American House Senior Living Communities (HQ)",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  },
  {
    "contactId": "0033j00003kfy1xAAA",
    "contactName": "Zoey Bond",
    "contactEmail": "zbond@bondcompanies.com",
    "suggestedAccountId": "0013j000031mXjUAAU",
    "suggestedAccountName": "Bond Companies",
    "confidence": "HIGH",
    "action": "UPDATE_TO_REVIEW"
  }
];

console.log('Updating ' + updates.length + ' contacts to Review status...');

// Update contacts to Review status
const highConfidenceIds = updates
    .filter(u => u.confidence === 'HIGH')
    .map(u => u.contactId);

if (highConfidenceIds.length > 0) {
    const updateQuery = `
    UPDATE Contact
    SET Clean_Status__c = 'Review',
        Delete_Reason__c = 'Potential Account Match Found'
    WHERE Id IN ('${highConfidenceIds.join("','")}')`;

    // Note: This would need to be executed via Apex or Data Loader
    console.log('High confidence contacts to update:', highConfidenceIds.length);
    console.log('Sample IDs:', highConfidenceIds.slice(0, 5));
}

console.log('\nReview these contacts manually to assign proper Accounts.');
