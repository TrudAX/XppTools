# Integration solution specification

Adapted version for D365FO/AX2012

## Defining the Integration Solution Topology

Integration topology specifies the physical location of the various entities in the integration environment. This topology should include information about the types of network connections among the participants, including LAN, WAN, Internet, dial-up, and so on.
 The integration specialist must ask whether all the constituent entities in an integration solution will be located:

- At a single physical site (a LAN with a single domain)? 
- At different sites that are connected via a WAN behind a firewall? 
- At different sites for various trading partners, separated by firewalls?

## Defining Business Data Flows

Defining Data Flow Requirements

- Sequence or order (in relation to other tasks and activities)
- Conditional data—data that is required to make processing decisions. (for example – file is created with the special extension in integration shared folder)
- Business or application rules—processing rules that are applied to the conditional data to determine the run-time execution path of the process. 
- Mappings—data transformations between the business events used as input and those used as output. For example, file moved to Processed folder after the import or some status file updated
- Business transactions—transactional boundaries in the process. A single process might contain many business transactions. In addition, for each business transaction, the integration specialist needs to define any compensating actions that must be performed if a transaction needs to be rolled back. 
- Error handling—what exceptions can occur and how they should be handled.
- Duplicate data handling—how system should react to already processed data(for example file with the same name)

## Analysing the Data Flow properties

- What are the characteristics of each data element? 
- What are the characteristics of messages? 
  -Message size, specified in terms of minimum, maximum, and average size 
  -Message volume, specified in the number of messages at peak, lull, and average volumes, plus any cyclical patterns 
  -Single or batched (aggregated) message. If messages are aggregated, do they need to be split up and routed appropriately? If so, what are the routing criteria or conditions? 
- What data transformations are needed between the source data and target data?

## Defining the Quality of Service

### Performance

- How quickly, in business terms, must the business process be carried out? 
- What are peak and off-peak performance requirements? 

### Availability and Reliability

- When must systems be available? Are they needed 24 hours a day, 7 days a week (24x7)? 
- What are the planned and anticipated periods of scheduled and unscheduled system downtime, respectively? 
- What is the maximum allowable downtime? 
- What failover and recovery protections are required in case a hardware or network failure occurs? 
- Do business messages need to be persisted while in transit and recovered upon a system restart? 

### Security

- How sensitive is the information in the business process? 
- What are the privacy needs associated with each role? 
- What security safeguards are currently in place? 

### Scalability

Define the scalability requirements for the business process, based on the current volume of work and the projected volume in the future. (for example, the volume of orders it can handle, without interruption to service or additional application development by using more advanced hardware).

### Logging and Nonrepudiation

- What kinds of problems can arise? 
- What information needs to be logged and monitored? 
- For integration solutions that use B2B integration, what information needs to be logged and maintained for audit or nonrepudiation purposes?



Original document

https://docs.oracle.com/cd/E13214_01/wli/docs70/design/reqs.htm 