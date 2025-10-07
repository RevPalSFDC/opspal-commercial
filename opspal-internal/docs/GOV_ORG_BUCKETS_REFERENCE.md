# Government Organization Buckets - Complete Reference Guide

## Overview

This document provides comprehensive definitions, examples, and classification guidance for all 28 government organization buckets used by the Government Organization Classifier.

**Version**: 1.0.0
**Last Updated**: 2025-10-07

## Table of Contents

- [Local/Municipal Government (3 buckets)](#localmunicipal-government)
- [County Government (6 buckets)](#county-government)
- [Emergency Services (3 buckets)](#emergency-services)
- [Corrections (2 buckets)](#corrections)
- [State Government (7 buckets)](#state-government)
- [Transportation & Infrastructure (3 buckets)](#transportation--infrastructure)
- [Higher Education (1 bucket)](#higher-education)
- [Federal Government (5 buckets)](#federal-government)
- [Non-Government (1 bucket)](#non-government)

---

## Local/Municipal Government

### 1. Local Law Enforcement

**Description**: City police departments and municipal law enforcement agencies.

**Organizational Characteristics**:
- Part of city/municipal government structure
- Jurisdiction typically limited to city boundaries
- Reports to mayor or city manager
- Funded by city budget

**Common Job Titles**:
- Police Chief
- Police Captain
- Police Lieutenant
- Police Sergeant
- Police Officer
- Detective
- Crime Analyst
- Records Manager

**Domain Patterns**:
- `*police.*.gov`
- `*citypd.gov`
- `*pd.city.*`
- `*[cityname].gov` (with police-related titles)

**Example Organizations**:
- Austin Police Department (austintexas.gov)
- Seattle Police Department (seattle.gov)
- Phoenix Police Department (phoenix.gov)
- Boston Police Department (boston.gov)

**Disambiguation Notes**:
- **vs County Sheriff**: Sheriff operates at county level, typically elected
- **vs State Police**: State police have statewide jurisdiction
- **vs University Police**: University police are part of educational institutions

**Confidence Indicators**:
- High (≥0.8): City domain + "police" in title or company name
- Medium (0.5-0.79): City domain + law enforcement keywords in title
- Low (<0.5): Ambiguous domain with generic title

---

### 2. Municipal Fire Department

**Description**: City fire departments providing fire suppression and rescue services.

**Organizational Characteristics**:
- Municipal department under city administration
- May include EMS services (combined fire/EMS)
- Jurisdiction limited to city boundaries
- Funded by city budget

**Common Job Titles**:
- Fire Chief
- Fire Captain
- Fire Lieutenant
- Firefighter/Paramedic
- Fire Marshal
- Fire Inspector
- Emergency Medical Technician (EMT)
- Paramedic

**Domain Patterns**:
- `*fire.*.gov`
- `*firerescue.*.gov`
- `*[cityname].gov` (with fire-related titles)

**Example Organizations**:
- Austin Fire Department (austintexas.gov)
- Chicago Fire Department (chicago.gov)
- Los Angeles Fire Department (lacity.org)
- Miami Fire Rescue (miamigov.com)

**Disambiguation Notes**:
- **vs County Fire**: County fire serves unincorporated areas
- **vs Hospital EMS**: Hospital EMS is part of healthcare system, not municipal government

**Confidence Indicators**:
- High (≥0.8): City domain + "fire" or "firefighter" in title
- Medium (0.5-0.79): City domain + "EMS" or "paramedic" in title (may be combined fire/EMS)
- Low (<0.5): Generic emergency services title without clear affiliation

---

### 3. City/County Emergency Management Office

**Description**: Municipal or county-level emergency management agencies coordinating disaster preparedness and response.

**Organizational Characteristics**:
- Coordinates multi-agency emergency response
- Manages emergency operations centers (EOC)
- Reports to city manager or county administrator
- Partners with FEMA and State OEM

**Common Job Titles**:
- Emergency Management Coordinator
- Emergency Management Director
- Emergency Preparedness Manager
- EOC Manager
- Disaster Response Coordinator

**Domain Patterns**:
- `*emergency.*.gov`
- `*oem.*.gov`
- `*[cityname].gov` or `*county.gov` (with EM titles)

**Example Organizations**:
- Austin Office of Homeland Security & Emergency Management (austintexas.gov)
- Los Angeles County Office of Emergency Management (lacounty.gov)
- Miami-Dade Emergency Management (miamidade.gov)

**Disambiguation Notes**:
- **vs State OEM**: State OEM operates at state level, coordinates across counties
- **vs FEMA**: FEMA is federal, OEM is local/county

**Confidence Indicators**:
- High (≥0.8): City/county domain + "emergency management" in title
- Medium (0.5-0.79): City/county domain + "EOC" or "disaster" keywords
- Low (<0.5): Generic emergency coordinator without clear government affiliation

---

## County Government

### 4. County Sheriff

**Description**: Elected county law enforcement officials with jurisdiction over unincorporated areas and county facilities.

**Organizational Characteristics**:
- Elected official (in most states)
- County-wide jurisdiction
- Operates county jails
- Provides law enforcement in unincorporated areas
- May provide contract services to municipalities

**Common Job Titles**:
- Sheriff
- Deputy Sheriff
- Undersheriff
- Captain (Sheriff's Office)
- Jail Administrator
- Corrections Deputy
- Court Security Officer

**Domain Patterns**:
- `*sheriff*.gov`
- `*[countyname]so.org`
- `*county.*.gov` (with sheriff in title)

**Example Organizations**:
- Los Angeles County Sheriff's Department (lasd.org)
- Tulsa County Sheriff's Office (tcso.org)
- Orange County Sheriff's Department (ocsheriff.gov)

**Disambiguation Notes**:
- **vs Local Police**: Police serve cities, sheriffs serve counties
- **vs State Police**: Sheriffs have county jurisdiction only

**Confidence Indicators**:
- High (≥0.8): County domain + "sheriff" or "deputy" in title
- Medium (0.5-0.79): County domain + law enforcement keywords
- Low (<0.5): Unclear jurisdiction or affiliation

---

### 5. County Fire Department

**Description**: County fire departments serving unincorporated areas and providing mutual aid to cities.

**Organizational Characteristics**:
- Serves unincorporated county areas
- May provide contract services to cities
- Often operates regional training facilities
- Coordinates mutual aid agreements

**Common Job Titles**:
- County Fire Chief
- Fire Captain
- Fire Engineer
- Firefighter/Paramedic
- Fire Prevention Officer
- Battalion Chief

**Domain Patterns**:
- `*fire.*.county.gov`
- `*[countyname]fire.gov`
- `*county.*.gov` (with fire in title)

**Example Organizations**:
- Los Angeles County Fire Department (fire.lacounty.gov)
- Fairfax County Fire and Rescue (fairfaxcounty.gov)
- Orange County Fire Authority (ocfa.org)

**Disambiguation Notes**:
- **vs Municipal Fire**: Municipal fire serves city limits, county fire serves unincorporated areas
- **vs State Fire Marshal**: Fire Marshal is regulatory/investigative, not suppression

**Confidence Indicators**:
- High (≥0.8): County domain + "fire" in company name
- Medium (0.5-0.79): County domain + fire-related title
- Low (<0.5): Ambiguous affiliation

---

### 6. County EMS

**Description**: County-operated emergency medical services separate from fire departments.

**Organizational Characteristics**:
- Standalone EMS agency (not part of fire department)
- Operates ambulances and paramedic services
- May serve multiple municipalities
- Often 911 ambulance provider

**Common Job Titles**:
- EMS Director
- Paramedic
- Emergency Medical Technician (EMT)
- EMS Supervisor
- Flight Paramedic (if helicopter service)
- EMS Training Officer

**Domain Patterns**:
- `*ems.*.county.gov`
- `*[countyname]ems.gov`
- `*ambulance.*.gov`

**Example Organizations**:
- Wake County EMS (wake.gov)
- Tulsa County EMS (tulsacounty.org)
- Pinellas County EMS (pinellas.gov)

**Disambiguation Notes**:
- **vs County Fire**: Separate agencies; county fire may or may not include EMS
- **vs Hospital EMS**: Hospital EMS is hospital-based, not county government

**Confidence Indicators**:
- High (≥0.8): County domain + standalone EMS agency
- Medium (0.5-0.79): County domain + "EMS" or "paramedic" in title (requires confirmation of separate agency)
- Low (<0.5): Unclear whether part of fire department

---

### 7. District Attorney

**Description**: County prosecutors responsible for criminal prosecutions (used in most states).

**Organizational Characteristics**:
- Elected or appointed county official
- Prosecutes criminal cases
- Works with law enforcement agencies
- May handle juvenile cases

**Common Job Titles**:
- District Attorney
- Assistant District Attorney (ADA)
- Deputy District Attorney (DDA)
- Chief Deputy DA
- Prosecutor
- Criminal Prosecutor

**Domain Patterns**:
- `*da.*.gov`
- `*districtattorney.*.gov`
- `*[countyname]da.gov`

**Example Organizations**:
- Los Angeles County District Attorney (da.lacounty.gov)
- Manhattan District Attorney (manhattanda.org)
- Tulsa County District Attorney (tulsacounty.org)

**Disambiguation Notes**:
- **vs Commonwealth Attorney**: Used in VA, KY, PA instead of "District Attorney"
- **vs County Prosecutor**: Used in NJ instead of "District Attorney"
- **vs State Attorney General**: AG operates at state level, not county

**Confidence Indicators**:
- High (≥0.8): County domain + "district attorney" or "ADA" in title
- Medium (0.5-0.79): County domain + "prosecutor" (check state naming)
- Low (<0.5): State-level prosecution role

---

### 8. County Prosecutors

**Description**: County prosecutors in New Jersey (equivalent to District Attorney elsewhere).

**Organizational Characteristics**:
- NJ-specific naming convention
- Same function as District Attorney
- Appointed by Governor (not elected)
- Prosecutes criminal cases

**Common Job Titles**:
- County Prosecutor
- Assistant Prosecutor
- Chief Assistant Prosecutor
- Deputy First Assistant Prosecutor

**Domain Patterns**:
- `*prosecutor.*.nj.gov`
- `*[countyname]prosecutor.nj.gov`

**Example Organizations**:
- Bergen County Prosecutor's Office (bergencountyprosecutor.org)
- Essex County Prosecutor (njecpo.org)
- Middlesex County Prosecutor (middlesexcountynj.gov)

**Disambiguation Notes**:
- **vs District Attorney**: Only used in New Jersey
- **State-specific**: If not NJ, classify as District Attorney

**Confidence Indicators**:
- High (≥0.8): NJ domain + "prosecutor" in title
- Medium (0.5-0.79): County prosecutor outside NJ (may be different naming)
- Low (<0.5): State-level prosecution

---

### 9. Commonwealth Attorney

**Description**: County prosecutors in Virginia, Kentucky, and Pennsylvania (equivalent to District Attorney).

**Organizational Characteristics**:
- Used in VA, KY, PA
- Elected county official
- Same function as District Attorney
- Prosecutes criminal cases

**Common Job Titles**:
- Commonwealth's Attorney
- Commonwealth Attorney
- Assistant Commonwealth's Attorney
- Deputy Commonwealth's Attorney

**Domain Patterns**:
- `*commonwealth*.*.va.gov`
- `*commonwealth*.*.ky.gov`
- `*commonwealth*.*.pa.gov`

**Example Organizations**:
- Virginia Beach Commonwealth's Attorney (vbgov.com)
- Jefferson County Commonwealth's Attorney (louisvilleky.gov)
- Philadelphia District Attorney (uses DA title, PA hybrid)

**Disambiguation Notes**:
- **State-specific**: Only VA, KY, PA
- **vs District Attorney**: Equivalent role, different title

**Confidence Indicators**:
- High (≥0.8): VA/KY/PA domain + "commonwealth attorney" in title
- Medium (0.5-0.79): VA/KY/PA prosecutor role
- Low (<0.5): Outside these three states

---

## Emergency Services

### 10. Hospital EMS Divisions

**Description**: Hospital-operated emergency medical services divisions.

**Organizational Characteristics**:
- Part of hospital or health system
- May operate ambulances
- Often provides interfacility transport
- Not a government agency (typically nonprofit or private)

**Common Job Titles**:
- EMS Director (Hospital)
- Hospital-Based Paramedic
- Flight Nurse
- Critical Care Paramedic
- EMS Coordinator

**Domain Patterns**:
- `*hospital.*.gov` or `*.org`
- `*health.*.gov`
- May use .org or .com (many hospitals are nonprofits)

**Example Organizations**:
- University Hospital EMS
- Mayo Clinic Ambulance Service
- Cleveland Clinic Emergency Services

**Disambiguation Notes**:
- **vs County EMS**: County EMS is government agency, hospital EMS is healthcare
- **Not Applicable for private hospitals**: Only classify if truly government-affiliated hospital

**Confidence Indicators**:
- High (≥0.8): Clear hospital affiliation + EMS role
- Medium (0.5-0.79): Healthcare domain + EMS keywords
- Low (<0.5): May be private contractor; classify as "Not Applicable" if contractor

---

### 11. Public Safety Answering Points (PSAP)

**Description**: 911 call centers that receive emergency calls and dispatch first responders.

**Organizational Characteristics**:
- May be city, county, or regional
- Dispatches police, fire, EMS
- Often called "consolidated dispatch"
- May serve multiple jurisdictions

**Common Job Titles**:
- 911 Dispatcher
- Emergency Dispatcher
- Communications Officer
- PSAP Director
- Dispatch Supervisor
- 911 Call Taker

**Domain Patterns**:
- `*911.*.gov`
- `*dispatch.*.gov`
- `*psap.*.gov`
- City or county domains with dispatch titles

**Example Organizations**:
- Austin-Travis County Emergency Communications Center (austintexas.gov)
- LA Regional Communications Center
- Seattle Police Communications

**Disambiguation Notes**:
- **vs 911 Center**: Same thing (different naming convention)
- **vs Local Police/Fire**: PSAP is dispatch center, not field operations

**Confidence Indicators**:
- High (≥0.8): Government domain + "911" or "dispatcher" in title
- Medium (0.5-0.79): Government domain + "communications" in title
- Low (<0.5): Private dispatch center

---

### 12. 911 Center

**Description**: Same as PSAP (alternate naming convention).

**Organizational Characteristics**:
- See PSAP bucket above
- Alternate naming for same function
- Receives 911 calls and dispatches responders

**Common Job Titles**:
- Same as PSAP

**Domain Patterns**:
- Same as PSAP

**Example Organizations**:
- Same as PSAP

**Disambiguation Notes**:
- **vs PSAP**: Use "PSAP" if official name includes "PSAP", otherwise "911 Center"

**Confidence Indicators**:
- Same as PSAP

---

## Corrections

### 13. Department of Corrections (DOC)

**Description**: State or county agencies operating prisons, jails, and correctional facilities.

**Organizational Characteristics**:
- State-level: Operates state prisons
- County-level: Operates county jails (often part of Sheriff)
- Manages inmate population
- Provides correctional programs

**Common Job Titles**:
- Corrections Officer
- Correctional Sergeant
- Warden
- Corrections Administrator
- Probation Officer (in some states)
- Facility Director

**Domain Patterns**:
- `*doc.state.*.gov`
- `*corrections.*.gov`
- `*[state]doc.gov`

**Example Organizations**:
- California Department of Corrections and Rehabilitation (cdcr.ca.gov)
- Texas Department of Criminal Justice (tdcj.texas.gov)
- Florida Department of Corrections (fdc.myflorida.com)

**Disambiguation Notes**:
- **vs County Sheriff**: Sheriff often operates county jail; DOC operates state prisons
- **vs Parole/Probation**: Some states separate probation from corrections

**Confidence Indicators**:
- High (≥0.8): State domain + "corrections" or "DOC" in company name
- Medium (0.5-0.79): State domain + corrections officer title
- Low (<0.5): County jail (may be part of sheriff)

---

### 14. Parole/Probation Boards

**Description**: Agencies overseeing parole and probation for criminal offenders.

**Organizational Characteristics**:
- State-level agency
- May be part of DOC or separate
- Supervises offenders in community
- Conducts parole hearings

**Common Job Titles**:
- Probation Officer
- Parole Officer
- Parole Board Member
- Supervision Officer
- Community Corrections Officer

**Domain Patterns**:
- `*parole.*.gov`
- `*probation.*.gov`
- May be subdomain of DOC

**Example Organizations**:
- California Board of Parole Hearings (cdcr.ca.gov)
- Texas Board of Pardons and Paroles (tdcj.texas.gov)
- Georgia Board of Pardons and Paroles (pap.georgia.gov)

**Disambiguation Notes**:
- **vs DOC**: DOC operates facilities, parole/probation supervises community offenders
- **State vs County**: Most parole/probation is state-level

**Confidence Indicators**:
- High (≥0.8): State domain + "parole" or "probation" in company/title
- Medium (0.5-0.79): State domain + community corrections keywords
- Low (<0.5): County-level probation (varies by state)

---

## State Government

### 15. State Attorney General's Office (AGO)

**Description**: Chief legal officer of state government, handles civil litigation and criminal appeals.

**Organizational Characteristics**:
- Elected or appointed state official
- Represents state in legal matters
- Consumer protection
- Criminal appeals
- Investigative divisions

**Common Job Titles**:
- Attorney General
- Assistant Attorney General
- Deputy Attorney General
- Chief Counsel
- Special Prosecutor
- Investigator (AG Office)

**Domain Patterns**:
- `*ag.state.*.gov`
- `*attorneygeneral.*.gov`
- `*[state]ag.gov`

**Example Organizations**:
- California Attorney General (oag.ca.gov)
- Texas Attorney General (texasattorneygeneral.gov)
- New York Attorney General (ag.ny.gov)

**Disambiguation Notes**:
- **vs District Attorney**: AG is state-level, DA is county-level
- **vs U.S. Attorney**: U.S. Attorney is federal

**Confidence Indicators**:
- High (≥0.8): State domain + "attorney general" or "AG" in title
- Medium (0.5-0.79): State domain + legal counsel role
- Low (<0.5): County or federal level

---

### 16. State Office of Emergency Management (State OEM)

**Description**: State-level emergency management coordinating disaster preparedness and response.

**Organizational Characteristics**:
- Coordinates state emergency response
- Partners with FEMA
- Manages state emergency operations center
- Distributes federal disaster funding

**Common Job Titles**:
- State Emergency Management Director
- Emergency Management Coordinator
- Disaster Recovery Specialist
- SEOC Manager
- Preparedness Planner

**Domain Patterns**:
- `*oem.state.*.gov`
- `*emergency.*.gov`
- `*homeland*.*.gov`

**Example Organizations**:
- California Governor's Office of Emergency Services (caloes.ca.gov)
- Texas Division of Emergency Management (tdem.texas.gov)
- Florida Division of Emergency Management (floridadisaster.org)

**Disambiguation Notes**:
- **vs City/County OEM**: State OEM coordinates across counties
- **vs FEMA**: FEMA is federal, State OEM is state-level

**Confidence Indicators**:
- High (≥0.8): State domain + "emergency management" in company name
- Medium (0.5-0.79): State domain + emergency management title
- Low (<0.5): Local/county level

---

### 17. Highway Patrol

**Description**: State police agencies primarily responsible for highway enforcement (state-specific naming).

**Organizational Characteristics**:
- State-level law enforcement
- Highway traffic enforcement
- May have broader jurisdiction
- Examples: California Highway Patrol (CHP), Florida Highway Patrol (FHP)

**Common Job Titles**:
- Highway Patrol Officer
- CHP Officer
- Trooper (in some states)
- Highway Patrol Commander

**Domain Patterns**:
- `*chp.ca.gov` (California)
- `*flhsmv.gov` (Florida)
- `*[state]hp.gov`

**Example Organizations**:
- California Highway Patrol (chp.ca.gov)
- Florida Highway Patrol (flhsmv.gov)
- Nevada Highway Patrol (nevadastatepolice.com)

**Disambiguation Notes**:
- **vs State Police**: Some states use "Highway Patrol", others use "State Police"
  - **Highway Patrol states**: CA, FL, NC, NV, OH
  - **State Police states**: PA, TX, NY, MA, VA
- Check state-specific naming before classifying

**Confidence Indicators**:
- High (≥0.8): State domain + "highway patrol" or "CHP" in title
- Medium (0.5-0.79): State trooper in highway patrol state
- Low (<0.5): State uses "State Police" naming

---

### 18. State Police

**Description**: State police agencies with broad law enforcement authority (state-specific naming).

**Organizational Characteristics**:
- State-level law enforcement
- Broader authority than highway patrol
- Criminal investigations
- Highway enforcement
- Examples: Pennsylvania State Police, Texas DPS, New York State Police

**Common Job Titles**:
- State Trooper
- State Police Officer
- State Police Detective
- Trooper
- State Police Commander

**Domain Patterns**:
- `*statepolice.*.gov`
- `*dps.*.gov` (Department of Public Safety)
- `*[state]statepolice.gov`

**Example Organizations**:
- Pennsylvania State Police (psp.pa.gov)
- Texas Department of Public Safety (dps.texas.gov)
- New York State Police (troopers.ny.gov)
- Massachusetts State Police (mass.gov/orgs/massachusetts-state-police)

**Disambiguation Notes**:
- **vs Highway Patrol**: See Highway Patrol bucket for state-specific naming
  - **State Police states**: PA, TX, NY, MA, VA, MI, IL, NJ
  - **Highway Patrol states**: CA, FL, NC, NV, OH

**Confidence Indicators**:
- High (≥0.8): State domain + "state police" or "trooper" in title
- Medium (0.5-0.79): State trooper in state police state
- Low (<0.5): State uses "Highway Patrol" naming

---

### 19. Bureau of Investigation / State Investigative Divisions

**Description**: State-level criminal investigation agencies (state equivalent of FBI).

**Organizational Characteristics**:
- State-level criminal investigations
- Supports local law enforcement
- Major crimes, organized crime
- Forensic services
- Examples: Texas Rangers, Georgia Bureau of Investigation (GBI)

**Common Job Titles**:
- Special Agent
- Criminal Investigator
- Forensic Scientist
- Intelligence Analyst
- Bureau Chief

**Domain Patterns**:
- `*gbi.ga.gov` (Georgia)
- `*fdle.state.fl.us` (Florida)
- `*dps.texas.gov/rangers` (Texas)
- `*[state]bureau*.gov`

**Example Organizations**:
- Georgia Bureau of Investigation (gbi.georgia.gov)
- Florida Department of Law Enforcement (fdle.state.fl.us)
- Texas Rangers (dps.texas.gov)
- California Bureau of Investigation (oag.ca.gov)

**Disambiguation Notes**:
- **vs State Police**: BI focuses on investigations, state police on patrol/enforcement
- **vs FBI**: FBI is federal, BI is state-level

**Confidence Indicators**:
- High (≥0.8): State domain + "bureau of investigation" in company name
- Medium (0.5-0.79): State domain + "special agent" or "criminal investigator"
- Low (<0.5): Federal (FBI) or local detective

---

### 20. Commercial Vehicle Enforcement

**Description**: State agencies enforcing commercial vehicle regulations and safety.

**Organizational Characteristics**:
- Part of state DOT or public safety
- Inspects commercial trucks
- Enforces hours of service regulations
- Operates weigh stations

**Common Job Titles**:
- Commercial Vehicle Inspector
- Motor Carrier Enforcement Officer
- Weigh Station Officer
- CVE Officer
- Truck Inspector

**Domain Patterns**:
- State DOT or DPS domains
- `*transportation.*.gov`
- `*publicsafety.*.gov`

**Example Organizations**:
- California Commercial Vehicle Enforcement (chp.ca.gov)
- Texas Motor Carrier Division (dps.texas.gov)
- Pennsylvania Motor Carrier Enforcement (penndot.pa.gov)

**Disambiguation Notes**:
- **vs DOT**: CVE is enforcement; DOT is broader transportation/infrastructure
- **vs Highway Patrol**: CVE focuses on commercial vehicles only

**Confidence Indicators**:
- High (≥0.8): State domain + "commercial vehicle" or "motor carrier" in title
- Medium (0.5-0.79): State domain + truck inspection keywords
- Low (<0.5): Federal (FMCSA) or private carrier

---

### 21. Conservation Agencies (Fish & Wildlife, DNR)

**Description**: State natural resources agencies managing fish, wildlife, and conservation.

**Organizational Characteristics**:
- Manages state parks and wildlife areas
- Issues hunting/fishing licenses
- Law enforcement (game wardens)
- Conservation programs
- Examples: DNR (Department of Natural Resources), Fish & Wildlife

**Common Job Titles**:
- Game Warden
- Conservation Officer
- Wildlife Biologist
- Park Ranger
- Natural Resources Specialist

**Domain Patterns**:
- `*dnr.*.gov`
- `*wildlife.*.gov`
- `*parks.*.gov`
- `*conservation.*.gov`

**Example Organizations**:
- California Department of Fish and Wildlife (wildlife.ca.gov)
- Texas Parks and Wildlife (tpwd.texas.gov)
- Wisconsin DNR (dnr.wisconsin.gov)
- Georgia DNR (gadnr.org)

**Disambiguation Notes**:
- **vs National Parks**: National parks are federal (NPS)
- **vs Local Parks**: City/county parks departments are municipal

**Confidence Indicators**:
- High (≥0.8): State domain + "DNR" or "Fish & Wildlife" in company name
- Medium (0.5-0.79): State domain + conservation/wildlife keywords
- Low (<0.5): Federal (NPS) or local parks

---

## Transportation & Infrastructure

### 22. Department of Transportation (DOT)

**Description**: State transportation agencies managing roads, bridges, and transportation infrastructure.

**Organizational Characteristics**:
- Plans and maintains state highways
- Manages construction projects
- Public transportation oversight
- Traffic engineering

**Common Job Titles**:
- Transportation Engineer
- Highway Maintenance Supervisor
- Traffic Engineer
- Construction Inspector
- Transportation Planner
- Bridge Inspector

**Domain Patterns**:
- `*dot.state.*.gov`
- `*transportation.*.gov`
- `*[state]dot.gov`

**Example Organizations**:
- California Department of Transportation (Caltrans) (dot.ca.gov)
- Texas Department of Transportation (txdot.gov)
- New York State DOT (dot.ny.gov)

**Disambiguation Notes**:
- **vs Federal DOT**: Federal DOT (USDOT) is federal agency
- **vs Highway Patrol/State Police**: DOT builds roads, police enforce laws on them
- **vs Turnpike/Highway Authority**: Toll roads often separate authority

**Confidence Indicators**:
- High (≥0.8): State domain + "DOT" or "transportation" in company name
- Medium (0.5-0.79): State domain + highway/bridge engineering keywords
- Low (<0.5): Federal DOT or local public works

---

### 23. Highway Authority (Turnpike, Tollway)

**Description**: State or regional agencies operating toll roads and bridges.

**Organizational Characteristics**:
- Operates toll roads and bridges
- Often quasi-governmental authorities
- Revenue-funded (toll collections)
- May have own police force

**Common Job Titles**:
- Toll Collection Manager
- Turnpike Maintenance Supervisor
- Toll Booth Operator
- Highway Authority Engineer
- Turnpike Police Officer

**Domain Patterns**:
- `*turnpike.*.gov` or `.org`
- `*tollway.*.gov` or `.org`
- `*thruway.ny.gov` (New York)
- `*[state]turnpike.org`

**Example Organizations**:
- Pennsylvania Turnpike Commission (paturnpike.com)
- New York State Thruway Authority (thruway.ny.gov)
- Florida's Turnpike Enterprise (floridasturnpike.com)
- Illinois Tollway (illinoistollway.com)

**Disambiguation Notes**:
- **vs State DOT**: Turnpike authorities operate specific toll roads, DOT manages entire state highway system
- **May use .org or .com**: Many are authorities with non-.gov domains

**Confidence Indicators**:
- High (≥0.8): Turnpike/tollway/thruway in company name
- Medium (0.5-0.79): Toll collection or turnpike operations keywords
- Low (<0.5): Private toll road operator (classify as "Not Applicable")

---

### 24. Ports Authority

**Description**: Regional agencies operating seaports, airports, and maritime facilities.

**Organizational Characteristics**:
- Operates ports and airports
- Often multi-jurisdiction authorities
- Economic development focus
- Examples: Port Authority of NY/NJ

**Common Job Titles**:
- Port Director
- Harbor Master
- Port Engineer
- Aviation Manager
- Port Security Officer
- Maritime Operations Coordinator

**Domain Patterns**:
- `*port.*.gov` or `.org`
- `*airport.*.gov` or `.org`
- `*maritime.*.gov`

**Example Organizations**:
- Port Authority of New York and New Jersey (panynj.gov)
- Port of Los Angeles (portoflosangeles.org)
- Port of Seattle (portseattle.org)
- Georgia Ports Authority (gaports.com)

**Disambiguation Notes**:
- **vs Federal (Coast Guard)**: Coast Guard is federal maritime security
- **May use .org or .com**: Many ports are authorities with non-.gov domains

**Confidence Indicators**:
- High (≥0.8): "Port Authority" or "Port of [City]" in company name
- Medium (0.5-0.79): Port/maritime operations keywords
- Low (<0.5): Private shipping company (classify as "Not Applicable")

---

## Higher Education

### 25. University Police

**Description**: Campus police departments at colleges and universities.

**Organizational Characteristics**:
- Part of university administration
- Jurisdiction on campus property
- May have sworn law enforcement authority
- Student safety focus

**Common Job Titles**:
- University Police Officer
- Campus Police Chief
- Campus Security Officer
- Public Safety Officer
- Campus Police Detective

**Domain Patterns**:
- `*police.[university].edu`
- `*[university].edu` (with police/public safety title)

**Example Organizations**:
- UCLA Police Department (police.ucla.edu)
- University of Texas at Austin Police (utexas.edu/police)
- MIT Police (police.mit.edu)

**Disambiguation Notes**:
- **vs Local Police**: University police jurisdiction is campus only
- **vs Campus Security (private)**: Must be sworn law enforcement, not just security guards

**Confidence Indicators**:
- High (≥0.8): .edu domain + "police" in company name or title
- Medium (0.5-0.79): .edu domain + "public safety" keywords
- Low (<0.5): Private security contractor on campus (classify as "Not Applicable")

---

## Federal Government

### 26. FEMA

**Description**: Federal Emergency Management Agency headquarters (not regional offices).

**Organizational Characteristics**:
- Federal agency under DHS
- Coordinates national disaster response
- Distributes disaster relief funding
- Manages National Response Framework

**Common Job Titles**:
- FEMA Administrator
- Emergency Management Specialist
- Disaster Assistance Coordinator
- Recovery Specialist
- Federal Coordinating Officer

**Domain Patterns**:
- `*@fema.dhs.gov` (headquarters)
- No "Region" in title/company

**Example Organizations**:
- Federal Emergency Management Agency (fema.gov)

**Disambiguation Notes**:
- **vs FEMA Regional Office**: Check for "Region" keyword - if present, use Regional Office bucket
- **vs State OEM**: FEMA is federal, OEM is state-level

**Confidence Indicators**:
- High (≥0.8): fema.dhs.gov domain + no "Region" in title/company
- Medium (0.5-0.79): FEMA domain + headquarters-specific keywords
- Low (<0.5): Regional office or state partner

---

### 27. FEMA Regional Office

**Description**: FEMA's 10 regional offices across the United States.

**Organizational Characteristics**:
- Regional coordination of disaster response
- Covers multiple states per region
- Partners with state/local emergency management
- 10 regions total

**Common Job Titles**:
- Regional Administrator
- Regional Coordinator
- Regional Program Specialist
- FEMA Region [X] staff

**Domain Patterns**:
- `*@fema.dhs.gov` (with "Region" in title or company)

**Example Organizations**:
- FEMA Region I (Boston)
- FEMA Region IV (Atlanta)
- FEMA Region IX (Oakland)
- FEMA Region X (Seattle)

**Disambiguation Notes**:
- **vs FEMA HQ**: Check for "Region" keyword - if present, use Regional Office
- **Region Detection**: Look for "Region I" through "Region X" or regional city names

**Confidence Indicators**:
- High (≥0.8): fema.dhs.gov domain + "Region" in title or company
- Medium (0.5-0.79): FEMA domain + regional city keywords
- Low (<0.5): Headquarters role

---

### 28. DHS Sub-Agency

**Description**: Department of Homeland Security component agencies (TSA, CBP, CISA, Secret Service, ICE, etc.).

**Organizational Characteristics**:
- Federal agencies under DHS
- Security and border protection missions
- Multiple specialized agencies

**Common Sub-Agencies**:
- Transportation Security Administration (TSA)
- Customs and Border Protection (CBP)
- Cybersecurity and Infrastructure Security Agency (CISA)
- U.S. Secret Service
- Immigration and Customs Enforcement (ICE)
- U.S. Coast Guard (also part of DOT)

**Common Job Titles**:
- TSA Officer / TSO
- CBP Officer
- Border Patrol Agent
- Special Agent (Secret Service)
- Cybersecurity Analyst (CISA)
- Immigration Officer

**Domain Patterns**:
- `*@tsa.dhs.gov`
- `*@cbp.dhs.gov`
- `*@cisa.dhs.gov`
- `*@usss.dhs.gov`
- `*@ice.dhs.gov`

**Example Organizations**:
- Transportation Security Administration (TSA)
- U.S. Customs and Border Protection (CBP)
- Cybersecurity and Infrastructure Security Agency (CISA)

**Disambiguation Notes**:
- **vs FEMA**: FEMA has its own buckets (HQ and Regional)
- **vs Federal Protective Service**: FPS has separate bucket

**Confidence Indicators**:
- High (≥0.8): DHS sub-agency domain (tsa.dhs.gov, cbp.dhs.gov, etc.)
- Medium (0.5-0.79): DHS domain + agency-specific title
- Low (<0.5): DHS headquarters or non-operational role

---

### 29. Federal Protective Service

**Description**: Federal law enforcement protecting federal buildings and facilities.

**Organizational Characteristics**:
- Protects federal buildings
- Part of DHS (formerly GSA)
- Law enforcement and security
- Works with contract security guards

**Common Job Titles**:
- FPS Officer
- Federal Protective Service Inspector
- Physical Security Specialist
- Federal Facility Security Officer

**Domain Patterns**:
- `*@fps.dhs.gov`
- May be part of ICE domain in some cases

**Example Organizations**:
- Federal Protective Service (fps.dhs.gov)

**Disambiguation Notes**:
- **vs Local Building Security**: FPS protects federal buildings only
- **vs U.S. Marshals**: Marshals protect federal courts, FPS protects federal buildings

**Confidence Indicators**:
- High (≥0.8): fps.dhs.gov domain or "Federal Protective Service" in company
- Medium (0.5-0.79): Federal facility security keywords
- Low (<0.5): State/local building security

---

### 30. U.S. Marshals Service

**Description**: Federal law enforcement agency protecting federal courts and apprehending fugitives.

**Organizational Characteristics**:
- Oldest federal law enforcement agency
- Protects federal courts and judges
- Fugitive apprehension
- Witness protection program
- Prisoner transport

**Common Job Titles**:
- U.S. Marshal
- Deputy U.S. Marshal
- Criminal Investigator
- Court Security Officer
- Witness Security Inspector

**Domain Patterns**:
- `*@usmarshals.gov`

**Example Organizations**:
- United States Marshals Service (usmarshals.gov)

**Disambiguation Notes**:
- **vs Federal Protective Service**: Marshals protect courts, FPS protects buildings
- **vs FBI**: FBI investigates federal crimes, Marshals apprehend fugitives

**Confidence Indicators**:
- High (≥0.8): usmarshals.gov domain or "U.S. Marshal" in title
- Medium (0.5-0.79): Federal court security or fugitive apprehension keywords
- Low (<0.5): State marshals (different from U.S. Marshals)

---

## Non-Government

### 31. Not Applicable

**Description**: Individuals who are not government employees - private contractors, vendors, consultants, or non-government organizations.

**Indicators of "Not Applicable"**:

**Company Name Patterns**:
- LLC, Inc., Corp, Limited, LLP
- "Consulting", "Solutions", "Services", "Group"
- "Technologies", "Systems", "Software"
- Private company names (e.g., "Public Safety Solutions LLC")

**Domain Patterns**:
- .com, .net, .io, .co
- Not .gov, .edu, or .mil

**Job Title Keywords**:
- "Consultant"
- "Contractor"
- "Vendor"
- "Account Executive" / "Sales"
- "Business Development"

**Common Scenarios**:
- Technology vendors selling to government
- Consulting firms advising government
- Private security companies
- Grant recipients (nonprofits)
- Academic researchers (unless university police)
- Private ambulance companies
- Private 911 call centers

**Example Entries**:
- Company: "Public Safety Solutions LLC" → Not Applicable
- Email: consultant@govtechservices.com → Not Applicable
- Title: "Account Executive" at software company → Not Applicable
- Email: admin@securitycontractor.io → Not Applicable

**Disambiguation Notes**:
- **vs Government Employee**: Check if truly employed by government or contracted
- **Contractors with .gov email**: Some contractors get .gov email forwarding - check company name for LLC/Inc

**Confidence Indicators**:
- High (≥0.8): .com/.net domain + LLC/Inc in company name
- Medium (0.5-0.79): Private company with government clients
- Low (<0.5): Unclear affiliation (need more research)

---

## Quick Reference: Disambiguation Decision Tree

### State Law Enforcement
```
Is it state-level law enforcement?
├─ Check state naming convention
│  ├─ CA, FL, NC, NV, OH → "Highway Patrol"
│  └─ PA, TX, NY, MA, VA, MI, IL, NJ → "State Police"
└─ Investigative/detective role? → "Bureau of Investigation"
```

### County Prosecutors
```
County-level prosecution?
├─ New Jersey → "County Prosecutors"
├─ VA, KY, PA → "Commonwealth Attorney"
└─ All other states → "District Attorney"
```

### FEMA
```
@fema.dhs.gov domain?
├─ Title or company contains "Region" → "FEMA Regional Office"
└─ No "Region" keyword → "FEMA"
```

### City vs County Fire/EMS
```
Fire or EMS role?
├─ City domain (e.g., austin.gov) → "Municipal Fire Department"
└─ County domain (e.g., lacounty.gov) → "County Fire Department" or "County EMS"
```

### Law Enforcement Levels
```
Law enforcement role?
├─ Federal domain (.dhs.gov, .usmarshals.gov) → Federal bucket
├─ State domain → State Police or Highway Patrol
├─ County domain + "sheriff" → "County Sheriff"
└─ City domain → "Local Law Enforcement"
```

### Contractor Detection
```
Potential contractor?
├─ Company name has LLC/Inc/Consulting? → "Not Applicable"
├─ Domain is .com/.net/.io? → "Not Applicable"
├─ Title is Consultant/Vendor? → "Not Applicable"
└─ Otherwise → Continue with classification
```

---

## Source Credibility Guidelines

When validating classifications, prioritize sources in this order:

1. **.gov domains** (credibility score: 0.4)
   - Official government websites
   - Most authoritative source

2. **.us domains** (credibility score: 0.35)
   - U.S. government or state domains
   - High credibility

3. **.edu domains** (credibility score: 0.3)
   - Educational institution sources
   - Good for university police

4. **LinkedIn profiles** (credibility score: 0.1)
   - Verify job titles and companies
   - Useful for corroboration

5. **News sources** (credibility score: 0.05)
   - Press releases
   - Local news articles
   - Lowest credibility tier (still useful)

**Evidence Quality Standards**:
- Minimum 2 sources required
- Average credibility score ≥ 0.5
- At least one high-credibility source (≥ 0.8)

---

## Frequently Confused Buckets

| Often Confused | Key Difference |
|----------------|----------------|
| **Local Police vs County Sheriff** | Police serve cities, sheriffs serve counties and operate jails |
| **State Police vs Highway Patrol** | Same function, different names by state (see state-specific naming) |
| **FEMA vs FEMA Regional** | Check for "Region" keyword in title/company |
| **DA vs Commonwealth Attorney** | Same role; VA/KY/PA use "Commonwealth Attorney" |
| **County Fire vs Municipal Fire** | County serves unincorporated areas, municipal serves city |
| **State OEM vs Local OEM** | State coordinates across counties, local serves one county/city |
| **DOT vs Highway Authority** | DOT manages all state roads, authority operates toll roads only |
| **Hospital EMS vs County EMS** | Hospital EMS is healthcare, County EMS is government agency |

---

**Version**: 1.0.0
**Last Updated**: 2025-10-07
**Maintained by**: RevPal Operations Team
