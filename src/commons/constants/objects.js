const OBJECTS = Object.freeze({
    ENTITY: "REQI",
    ENTITY_PROJ: "PROJ",
    ENTITY_ITEM: "ITEM",
    ENTITY_COUN: "COUN",
    ENTITY_ITRQ: "ITRQ",
    STATUS: {
        PENDING_APPROVAL: "PENDING_APPROVAL",
        APPROVED: "APPROVED",
        REJECTED: "REJECTED",
        CANCELED: "CANCELED",
        CLOSED: "CLOSED",
        PROCCESS: "PROCCESS"
    },
    ALLOWED_UPDATE_STATUS: ["REJECTED"],
    SEARCH_PROJECTION: "PK,creationDate,project,status,projectName,creatorName",
    REPORT_PROJECTION: "PK,project,projectName,creatorName,creationDate,requireDate,approveDate,motive,requests,outs,status",
    REPORT_ITEMS_PROJECTION: "PK,project,creatorName,code,name,quantity",
    PK_PROJECTION: "PK,SK,creationUser,creatorName,approveDate,approverName,project,projectName,creationDate,requireDate,motive,observations,fileExtension,status,item,code,name,unity,quantity"
});

module.exports = OBJECTS;
