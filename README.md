# XppTools

Useful X++ code samples

This repository contains 3 D365FO models:

- [XppTools](#xpptools)
  - [DEVTools model](#devtools-model)
    - [-Fields list](#-fields-list)
    - [-Display system field name in the query filter](#-display-system-field-name-in-the-query-filter)
    - [-Display table relation fields](#-display-table-relation-fields)
    - [-Editable table browser](#-editable-table-browser)
  - [DEVCommon model](#devcommon-model)
    - [-DEV class](#-dev-class)
    - [-DEVDimensionHelper class](#-devdimensionhelper-class)
    - [-Read Excel and CSV files](#-read-excel-and-csv-files)
  - [DEVTutorial model](#devtutorial-model)
    - [-Blocking in D365FO](#-blocking-in-d365fo)
    - [-Create ledger journals using X++](#-create-ledger-journals-using-x)
    - [-Create ledger journal from Excel file](#-create-ledger-journal-from-excel-file)
    - [-Sales Invoice report](#-sales-invoice-report)
  - [Installation](#installation)
  - [Contribution](#contribution)

The DEV prefix is used for all objects.

## DEVTools model

It contains user X++ tools, with the additional application functionality. Each tool is located in the separate sub-model.

### -Fields list

Fields list form is an extended version of the standard Show all fields form with the additional features such as displaying all fields with the extended information, comparing and editing

Full description: [Fields list form](https://denistrunin.com/xpptools-fieldslist/). Sub-model name: DEVRecordInfo

![](assets/fieldslistEx.png)

### -Display system field name in the query filter

This utility adds system field name in the standard query filter lookup and in the "Personalize-Add columns" dialog. So you can search the field by Label(as standard) or by AOT name

Full description: [Filter by AOT name](https://denistrunin.com/xpptools-queryfieldsAOTname/). Sub-model name: DEVQueryFieldsAOTName

![](assets/DEVQueryFieldsAOTName.png)
![](assets/DEVQueryFieldsAOTNamePers.png)

### -Display table relation fields

This utility adds additional relation information into **Add table join** function of the standard Advanced query form(Advanced filter or sort - Joins - Add table join)

Code is based on **sukhanchik** post on [axForum](https://translate.google.com/translate?hl=en&sl=ru&tl=en&u=http%3A%2F%2Faxforum.info%2Fforums%2Fshowthread.php%3Fp%3D417433%23post417433&sandbox=1)

Sub-model name: DEVSysQueryFormAddRelInfo

![](assets/DEVSysQueryFormAddRelInfo.png)

### -Editable table browser

Extension for the standard D365FO table browser that allows root navigation and editing for non-development environments.

Full description: [Editable table browser](https://denistrunin.com/xpptools-devtablebrowser/). Sub-model name: DEVSysTableBrowser


**[⬆ back to top](#XppTools)**

## DEVCommon model

Elements that can be shared between different projects

### -[DEV](https://github.com/TrudAX/XppTools/blob/master/DEVCommon/DEVCommon/AxClass/DEV.xml) class

Collection of [global methods](https://denistrunin.com/xpptools-devglobal/)

### -DEVDimensionHelper class

[DEVDimensionHelper](https://github.com/TrudAX/XppTools/blob/master/DEVCommon/DEVCommon/AxClass/DEVDimensionHelper.xml) class contains various methods to work with the financial dimensions.

Description: Working with the [Financial dimensions](https://denistrunin.com/xpptools-devfindim/)

### -Read Excel and CSV files

Classes: [**DEVFileReaderBase**](https://github.com/TrudAX/XppTools/blob/master/DEVCommon/DEVCommon/AxClass/DEVFileReaderBase.xml),  [**DEVFileReaderCSV**](https://github.com/TrudAX/XppTools/blob/master/DEVCommon/DEVCommon/AxClass/DEVFileReaderCSV.xml) and  [**DEVFileReaderExcel**](https://github.com/TrudAX/XppTools/blob/master/DEVCommon/DEVCommon/AxClass/DEVFileReaderExcel.xml)  - read from CSV and XLSX files

Description: [How to read Excel and CSV files in D365FO using X++](https://denistrunin.com/xpptools-readexcelfile/)

**[⬆ back to top](#XppTools)**

## DEVTutorial model

Various X++ examples, that can be used to test something or used as a template. Elements can reference to DEVCommon model objects

### -Blocking in D365FO

Form **DEVBlockingTest**, table **DEVBlockingTestTable**(to test SQL blocking issues)

[Blocking in D365FO](https://denistrunin.com/understanding-sql-blocking/)

### -Create ledger journals using X++

Class **[DEVTutorialCreateLedgerJournal](https://github.com/TrudAX/XppTools/blob/master/DEVTutorial/DEVTutorial/AxClass/DEVTutorialCreateLedgerJournal.xml)** that demonstrates different methods for a ledger journal creation

[Create ledger journals in D365FO using X++](https://denistrunin.com/xpptools-createledgerjournal/)

### -Create ledger journal from Excel file

Class [**DEVReadFromFileExampleCreateJournal**](https://github.com/TrudAX/XppTools/blob/master/DEVTutorial/DEVTutorial/AxClass/DEVReadFromFileExampleCreateJournal.xml)  - sample code to create a ledger journal from Excel file

## DEVTutorialReports model

Contains report development examples

### -Sales Invoice report

A sample code to Create a new design for Sales Invoice report in D365FO (https://denistrunin.com/xpptools-reportsalesinvoice/)

**[⬆ back to top](#XppTools)**

## Installation

1. Download the Source code from this GitHub repo into the Temp directory on the DEV VM.

2. Copy **DEVTools**(or DEVGlobal, DEVTutorial) folder to your package folder (C:\AOSService\PackagesLocalDirectory )

3. Start Visual Studio and Run compile for the **DEVTools** folder (Dynamics 365 –Build models.. – Select DEVTools)

![](assets/CopyFolderToLocal.png)

If you want to contribute - change the objects using Visual Studio in the **DEVTools** model, copy the changed elements(xml files) back into the Temp folder and create GitHub pull request from this Temp folder.

## Contribution

Feel free to create issues and PRs 😃
