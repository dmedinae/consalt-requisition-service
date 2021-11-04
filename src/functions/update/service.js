"use strict";

const { BaseDao, BaseObject } = require("@inlaweb/base-node");
const Constants = require("../../commons/constants/objects");
const moment = require("moment-timezone");
const S3 = require("aws-sdk").S3;

/**
 * Service class.
 * @extends BaseObject
 */
class Service extends BaseObject {
    /**
     * Create a Service.
     */
    constructor() {
        super();
        this.s3 = new S3();
        this.dao = new BaseDao();
        this.table = process.env.TABLE_NAME;
        this.permissionTable = process.env.TABLE_PERMISSIONS_NAME;
        this.bucketName = process.env.BUCKET_NAME;
    }

    /**
     * Initialize the variables.
     * @param {object} event - The event object.
     * @param {object} context - The context object.
     */
    initialize(event, context) {
        super.initialize(event, context);
        this.dao.initialize(event, context);
    }

    /**
     * Function to save a item.
     * @return {object} The object with the respective PK.
     */
    async update() {
        try {
            // Se valida permiso a la opción de creación
            const permission = await this.dao.validatePermissions(this.permissionTable, Constants.ENTITY, ["UPDATE"]);

            let transactionOperations = [];
            const body = this.event.body;

            // Se consulta la requisición actual y sus items
            const params = {
                indexName: "",
                parameters: [{ name: "PK", value: this.event.body.PK, operator: "=" }],
            };
            const currentRequisition = await this.dao.query(this.table, params);
            if (!currentRequisition.length) {
                throw this.createResponse("REQI_NO_FOUND", null, {});
            }

            if (permission === "OWNS" && currentRequisition[0].creationUser !== this.tokenData["cognito:username"]) {
                throw this.createResponse("UNAUTHORIZE_REQUEST", null, {});
            }

            const PK = body.PK;

            // Se obtienen los items a crear
            const itemsForCreate = body.items.filter(item => !item.SK);
            let PKITEM = itemsForCreate.length ? await this.dao.getId(this.table, Constants.ENTITY_ITRQ, itemsForCreate.length) : undefined;

            const processItems = {};

            // Se validan los items y se crean las operaciones en lotes de 10
            let itemsPromises = [];
            for (let i = 0; i < body.items.length; i++) {
                if (!body.items[i].SK || !processItems[body.items[i].SK]) {
                    processItems[body.items[i].SK] = 1;
                    if (body.items[i].SK) {
                        transactionOperations.push(this.createItemUpdateOperation(body.items[i], PK))
                    } else {
                        body.items[i].SK = `${Constants.ENTITY_ITRQ}${PKITEM}`;
                        itemsPromises.push(
                            this.createItemOperation(body.items[i], PK)
                        )
                        PKITEM++;
                    }
                }
                if (itemsPromises.length && itemsPromises.length >= 5 || i === (body.items.length - 1)) {
                    const resultItems = await Promise.all(itemsPromises).catch(error => {
                        this.createLog("error", "Service error", error);
                        throw this.createResponse("INVALID_REQUEST", null, {});
                    });
                    transactionOperations.push(...resultItems);
                    itemsPromises = [];
                }
            }

            // Se eliminan los items removidos
            const inItems = Object.keys(processItems);
            // Se agrega la PK de la remisión para removerla de los items a eliminar
            inItems.push(PK);
            for (let element of currentRequisition) {
                if (!inItems.includes(element.SK)) {
                    transactionOperations.push({ Delete: { TableName: this.table, Key: { PK, SK: element.SK } } });
                }
            }

            // Se construye el encabezado
            transactionOperations.push(this.createRequisitionObject(body))

            await this.dao.writeTransactions(transactionOperations, 24);
            await this.dao.audit(Constants.ENTITY, PK, "UPDATE");

            let url;

            if (this.event.body.fileExtension) {
                // Parametros para generar la URL firmada para subir template del contrato
                const params = {
                    Bucket: this.bucketName,
                    Key: `${Constants.ENTITY}/${PK}_${PK}.${body.fileExtension}`,
                    ContentType: "binary/octet-stream",
                    Expires: 360,
                };
                url = await this.s3.getSignedUrlPromise("putObject", params);
            }

            // Se retorna el id insertado
            return { PK, url };
        } catch (error) {
            this.createLog("error", "Service error", error);
            throw this.createResponse("INTERNAL_ERROR", null, error);
        }
    }

    /**
     * Function to format the data to save in DDB.
     * @param {object} payload - Data of the user.
     * @return {object} Dynamo object with the data to save.
     */
    createItemUpdateOperation(item, PK) {
        const itemUpdate = { quantity: item.quantity };
        const setAttributes = Object.keys(item);
        return this.dao.createUpdateParams(this.table, PK, item.SK, itemUpdate, setAttributes);
    }

    /**
     * Function to format the data to save in DDB.
     * @param {object} payload - Data of the user.
     * @return {object} Dynamo object with the data to save.
     */
    async createItemOperation(item, PK) {
        //Se valida el item
        const itemCoding = await this.dao.get(this.table, item.item, item.item);
        if (!itemCoding) {
            throw this.createResponse("INVALID_REQUEST", null, {});
        }
        return { Put: { TableName: this.table, Item: this.createItemObject(PK, item) } };
    }

    /**
     * Function to format the data to save in DDB.
     * @param {object} payload - Data of the user.
     * @return {object} Dynamo object with the data to save.
     */
    createItemObject(PK, item) {
        const creationDate = moment.tz(new Date(), "America/Bogota").format("YYYY-MM-DD");
        return {
            PK: PK,
            SK: item.SK,
            entity: Constants.ENTITY_ITRQ,
            item: item.item,
            quantity: item.quantity,
            creationUser: this.tokenData["cognito:username"],
            creationDate: creationDate,
        };
    }

    /**
     * Function to format the data to save in DDB.
     * @param {object} payload - Data of the user.
     * @return {object} Dynamo object with the data to save.
     */
    createRequisitionObject(payload) {
        const item = {
            requireDate: payload.requireDate,
            motive: payload.motive,
            observations: payload.observations,
            fileExtension: payload.fileExtension,
        };
        const setAttributes = Object.keys(item);
        return this.dao.createUpdateParams(this.table, payload.PK, payload.PK, item, setAttributes);
    }
}

module.exports = Service;
